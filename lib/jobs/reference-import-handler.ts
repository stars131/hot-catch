import { CredentialProvider, JobType, Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError, isAppError } from "@/lib/errors";
import { registerJobHandler } from "@/lib/jobs/handlers";
import type { JobHandler } from "@/lib/jobs/types";
import { prisma } from "@/lib/prisma";
import { TikHubProvider } from "@/lib/providers/tikhub/provider";
import { FirecrawlProvider } from "@/lib/providers/firecrawl/provider";
import type { SocialAccount, SocialContent } from "@/lib/providers/types";
import { loadCredential } from "@/lib/services/credential-service";
import { assertUrlSafe, extractHtmlSummary, safeFetchText } from "@/lib/security/url-guard";
import { enqueueJob } from "@/lib/jobs/queues";
import { PLATFORM_IDS, type PlatformId } from "@/lib/platforms/registry";

const inputSchema = z.object({
  url: z.string().url(),
  kind: z.enum(["account", "content", "webpage"]).optional(),
  platform: z.enum([...PLATFORM_IDS, "web"]).optional(),
  conversationId: z.string().optional(),
});

const referenceImportHandler: JobHandler = async (payload, reportProgress) => {
  const input = inputSchema.parse(payload.input);
  await reportProgress(5, "校验链接安全性");
  const safeUrl = await assertUrlSafe(input.url);
  await reportProgress(10, "识别链接");

  const hostname = new URL(safeUrl).hostname.toLowerCase();
  const isSocialUrl =
    hostname.includes("xiaohongshu.com") ||
    hostname.includes("xhslink.com") ||
    hostname.includes("douyin.com") ||
    hostname.includes("iesdouyin.com");
  if (input.kind === "webpage" || !isSocialUrl) {
    return importWebReference(
      payload.userId,
      safeUrl,
      reportProgress,
      input.platform ?? "web",
    );
  }

  let credential: Record<string, string>;
  try {
    credential = await loadCredential(payload.userId, CredentialProvider.tikhub);
  } catch (error) {
    if (isAppError(error) && error.code === "CREDENTIAL_NOT_CONFIGURED") {
      return {
        finalStatus: "waiting_input",
        output: {
          reason: "TIKHUB_CREDENTIAL_REQUIRED",
          message: "配置 TikHub 凭证后可继续导入，也可以选择手工录入。",
          manualFields: ["platform", "accountName", "title", "content", "sourceUrl"],
        },
      };
    }
    throw error;
  }

  const apiKey = credential.apiKey ?? credential.token;
  if (!apiKey) {
    throw new AppError("CREDENTIAL_INVALID", "TikHub 凭证缺少 apiKey。", 422);
  }
  const provider = new TikHubProvider(apiKey);
  const reference = await provider.parseReference(safeUrl);

  if (reference.kind === "account") {
    await reportProgress(30, "读取账号资料");
    const account = await provider.getAccount(reference);
    const savedAccount = await saveAccount(payload.userId, account);
    await reportProgress(55, "读取最近作品");
    const page = await provider.listAccountContent(account);
    let savedCount = 0;
    for (const content of page.items) {
      await saveContent(savedAccount.id, content);
      savedCount += 1;
      await reportProgress(55 + (savedCount / Math.max(page.items.length, 1)) * 40, "保存作品");
    }
    return {
      resultType: "benchmarkAccount",
      resultId: savedAccount.id,
      output: { importedContentCount: savedCount, hasMore: page.hasMore },
    };
  }

  await reportProgress(35, "读取作品详情");
  const content = await provider.getContent(reference);
  const account = await ensureContentAccount(payload.userId, content);
  const savedContent = await saveContent(account.id, content);

  // 抖音视频没有可靠转写时,串联 ASR 子任务(parentJobId 关联;无凭证时子任务进入 waiting_input)
  let transcriptionJobId: string | null = null;
  if (
    content.platform === "douyin" &&
    !savedContent.transcript &&
    (content.contentType === "video" || content.durationSec)
  ) {
    const parentJob = await prisma.processingJob.findUnique({
      where: { id: payload.databaseJobId },
      select: { agentRunId: true },
    });
    const child = await enqueueJob({
      userId: payload.userId,
      type: JobType.analysis,
      action: "transcription.run",
      input: { noteId: savedContent.id },
      idempotencyKey: `transcription:${savedContent.id}`,
      agentRunId: parentJob?.agentRunId ?? undefined,
      parentJobId: payload.databaseJobId,
    });
    transcriptionJobId = child.id;
  }

  await reportProgress(95, "保存作品");
  return {
    resultType: "benchmarkNote",
    resultId: savedContent.id,
    output: {
      platform: content.platform,
      platformContentId: content.platformContentId,
      ...(transcriptionJobId ? { transcriptionJobId } : {}),
    },
  };
};

async function saveAccount(userId: string, account: SocialAccount) {
  return prisma.benchmarkAccount.upsert({
    where: {
      userId_platform_platformAccountId: {
        userId,
        platform: account.platform,
        platformAccountId: account.platformAccountId,
      },
    },
    update: {
      nickname: account.nickname,
      avatarUrl: account.avatarUrl,
      profileUrl: account.profileUrl,
      description: account.description,
      followerCount: account.followerCount,
      followingCount: account.followingCount,
      likedCount: account.likedCount,
      noteCount: account.contentCount,
      rawData: account.raw as Prisma.InputJsonValue,
      sourceType: "tikhub",
      fetchStatus: "success",
      dataConfidence: 0.9,
      lastFetchedAt: new Date(),
      ...(account.platform === "xiaohongshu" ? { xhsId: account.platformAccountId } : {}),
    },
    create: {
      userId,
      platform: account.platform,
      platformAccountId: account.platformAccountId,
      xhsId: account.platform === "xiaohongshu" ? account.platformAccountId : null,
      nickname: account.nickname,
      avatarUrl: account.avatarUrl,
      profileUrl: account.profileUrl,
      description: account.description,
      followerCount: account.followerCount,
      followingCount: account.followingCount,
      likedCount: account.likedCount,
      noteCount: account.contentCount,
      rawData: account.raw as Prisma.InputJsonValue,
      sourceType: "tikhub",
      fetchStatus: "success",
      dataConfidence: 0.9,
      lastFetchedAt: new Date(),
    },
  });
}

async function ensureContentAccount(userId: string, content: SocialContent) {
  const platformAccountId =
    content.platformAccountId ?? `content-owner:${content.platformContentId}`;
  return saveAccount(userId, {
    platform: content.platform,
    platformAccountId,
    nickname: content.platformAccountId ? undefined : "待补充作者",
    raw: {},
  });
}

async function saveContent(accountId: string, content: SocialContent) {
  const data = {
    noteId: content.platformContentId,
    platformContentId: content.platformContentId,
    noteUrl: content.sourceUrl,
    title: content.title,
    content: content.body,
    contentType: content.contentType,
    coverUrl: content.coverUrl,
    durationSec: content.durationSec,
    publishTime: content.publishedAt,
    likeCount: content.metrics.likes,
    collectCount: content.metrics.collects,
    commentCount: content.metrics.comments,
    shareCount: content.metrics.shares,
    metricsUpdatedAt: new Date(),
    rawData: content.raw as Prisma.InputJsonValue,
    sourceType: "tikhub",
    dataConfidence: 0.9,
  };
  return prisma.benchmarkNote.upsert({
    where: {
      accountId_platformContentId: {
        accountId,
        platformContentId: content.platformContentId,
      },
    },
    update: data,
    create: { accountId, ...data },
  });
}

registerJobHandler("reference.import", referenceImportHandler);

async function importWebReference(
  userId: string,
  url: string,
  reportProgress: (progress: number, stage: string) => Promise<void>,
  platform: PlatformId | "web" = "web",
) {
  // 同一用户重复导入同一网页:直接复用已有 Idea,不重复创建
  const existing = await prisma.idea.findFirst({
    where: {
      userId,
      source: "reference",
      evidence: { path: ["sourceUrl"], equals: url },
    },
  });
  if (existing) {
    await reportProgress(90, "复用已导入的参考资料");
    return { resultType: "idea", resultId: existing.id, output: { deduplicated: true } };
  }

  let extracted: { title?: string; markdown: string; metadata: Record<string, unknown>; method: "firecrawl" | "basic_fetch" };
  let credential: Record<string, string> | null = null;
  try {
    credential = await loadCredential(userId, CredentialProvider.firecrawl);
  } catch (error) {
    if (!isAppError(error) || error.code !== "CREDENTIAL_NOT_CONFIGURED") throw error;
  }

  try {
    if (credential) {
      const apiKey = credential.apiKey ?? credential.token;
      if (!apiKey) throw new AppError("CREDENTIAL_INVALID", "Firecrawl 凭证缺少 apiKey。", 422);
      await reportProgress(35, "使用 Firecrawl 提取公开页面");
      const result = await new FirecrawlProvider(apiKey, credential.baseUrl).importUrl(url);
      extracted = { title: result.title, markdown: result.markdown, metadata: result.metadata, method: "firecrawl" };
    } else {
      await reportProgress(35, "安全抓取公开页面");
      const fetched = await safeFetchText(url);
      const summary = extractHtmlSummary(fetched.text);
      if (!summary.text) throw new Error("empty public page");
      extracted = {
        title: summary.title || undefined,
        markdown: summary.text,
        metadata: { fetchedFrom: fetched.finalUrl, truncated: fetched.truncated, method: "basic_fetch" },
        method: "basic_fetch",
      };
    }
  } catch (error) {
    if (isAppError(error) && error.code === "CREDENTIAL_INVALID") throw error;
    return {
      finalStatus: "waiting_input" as const,
      output: {
        reason: "PUBLIC_REFERENCE_BLOCKED",
        message: "公开页面拒绝访问或未提取到正文。请粘贴你有权使用的摘要后继续；系统不会虚构来源内容。",
      },
    };
  }

  const idea = await prisma.idea.create({
    data: {
      userId,
      source: "reference",
      status: "saved",
      title: extracted.title || new URL(url).hostname,
      notes: extracted.markdown.slice(0, 5000),
      evidence: {
        sourceUrl: url,
        platform,
        importedBy: extracted.method,
        usage: "current_user_inference_only",
        ...(platform === "reddit"
          ? { policyNote: "Reddit content is not used for model training or cross-user datasets." }
          : {}),
        metadata: extracted.metadata,
        markdown: extracted.markdown.slice(0, 50000),
      } as Prisma.InputJsonValue,
    },
  });
  await reportProgress(90, "保存参考资料");
  return { resultType: "idea", resultId: idea.id };
}
