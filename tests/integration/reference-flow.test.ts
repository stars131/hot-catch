import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CredentialProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getJobHandler } from "@/lib/jobs/handlers";
import "@/lib/jobs/reference-import-handler";
import "@/lib/jobs/transcription-handler";
import { saveCredential } from "@/lib/services/credential-service";
import { invokeCardAction } from "@/lib/creator/agent-service";
import { CHAT_PROTOCOL, type ChatCard } from "@/lib/creator/chat-protocol";
import { referenceCardActions } from "@/lib/creator/agent-service";
import xhsFixture from "@/tests/fixtures/tikhub/xhs-note.json";
import douyinFixture from "@/tests/fixtures/tikhub/douyin-video.json";

const articleHtml = readFileSync(
  path.resolve(__dirname, "../fixtures/web/article.html"),
  "utf8",
);

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userAId = "";
let userBId = "";
let convAId = "";

const server = setupServer(
  http.get("https://tikhub.test/api/v1/xiaohongshu/app_v2/get_image_note_detail", () =>
    HttpResponse.json(xhsFixture),
  ),
  http.get("https://tikhub.test/api/v1/douyin/web/fetch_one_video", () =>
    HttpResponse.json(douyinFixture),
  ),
  http.get("http://web.test/article", () => HttpResponse.html(articleHtml)),
);

const noopProgress = async () => {};

async function runImport(userId: string, url: string) {
  const job = await prisma.processingJob.create({
    data: {
      userId,
      type: "ingest",
      queueName: "ingest",
      action: "reference.import",
      status: "running",
      input: { url },
    },
  });
  const handler = getJobHandler("reference.import");
  const result = await handler(
    { databaseJobId: job.id, userId, action: "reference.import", input: { url } },
    noopProgress,
  );
  await prisma.processingJob.update({
    where: { id: job.id },
    data: {
      status: result.finalStatus === "waiting_input" ? "waiting_input" : "succeeded",
      resultType: result.resultType,
      resultId: result.resultId,
      output: result.output ?? undefined,
    },
  });
  return { jobId: job.id, result };
}

async function createReferenceCardMessage(conversationId: string, jobId: string, sourceUrl: string) {
  const card: ChatCard = {
    id: `card-ref-${jobId}`,
    version: 1,
    type: "reference",
    state: "importing",
    sourceUrl,
    platform: "xiaohongshu",
    jobId,
    actions: referenceCardActions(),
  };
  return prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: "参考卡",
      status: "complete",
      metadata: { protocol: CHAT_PROTOCOL, cards: [card] },
    },
  });
}

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "bypass" });
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `c4-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `c4-b-${runId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
  await saveCredential(userAId, CredentialProvider.tikhub, { apiKey: `tk-${runId}` });
  const conversation = await prisma.conversation.create({
    data: { userId: userAId, title: `C4 ${runId}` },
  });
  convAId = conversation.id;
});

afterEach(() => server.resetHandlers());

afterAll(async () => {
  server.close();
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("小红书 fixture 导入与一键生成", () => {
  const xhsUrl = "https://www.xiaohongshu.com/explore/65f0000000000000000abc01";

  it("导入保存作品;按 platformContentId 去重", async () => {
    const first = await runImport(userAId, xhsUrl);
    expect(first.result.resultType).toBe("benchmarkNote");
    const second = await runImport(userAId, xhsUrl);
    expect(second.result.resultId).toBe(first.result.resultId);
    const notes = await prisma.benchmarkNote.findMany({
      where: { platformContentId: "65f0000000000000000abc01", account: { userId: userAId } },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].content).toContain("每天记录三件事");
  });

  it("一键生成:创建 Content + ContentReference + 生成任务;重复点击不重复创建", async () => {
    const { jobId } = await runImport(userAId, xhsUrl);
    const source = await createReferenceCardMessage(convAId, jobId, xhsUrl);

    const first = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `gen-1-${runId}`,
      sourceMessageId: source.id,
      cardId: `card-ref-${jobId}`,
      actionId: "reference.generate_original",
    });
    expect(first.replayed).toBe(false);
    expect(first.resultMessage.content).toContain("原创稿");

    const references = await prisma.contentReference.findMany({
      where: { userId: userAId, sourceUrl: xhsUrl },
    });
    expect(references).toHaveLength(1);
    const snapshot = references[0].snapshot as Record<string, unknown>;
    expect(snapshot).toHaveProperty("structure");
    expect(snapshot).toHaveProperty("boundaries");
    // 脱敏:snapshot 不携带供应商 rawData
    expect(JSON.stringify(snapshot)).not.toContain("interact_info");

    const generationJobs = await prisma.processingJob.findMany({
      where: { userId: userAId, action: "content.generate" },
    });
    const contentIds = new Set(
      generationJobs.map((job) => (job.input as { contentId?: string }).contentId),
    );

    // 重复点击(新的 clientActionId)→ 返回第一次结果,不新建
    const second = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `gen-2-${runId}`,
      sourceMessageId: source.id,
      cardId: `card-ref-${jobId}`,
      actionId: "reference.generate_original",
    });
    expect(second.replayed).toBe(true);
    expect(second.resultMessage.id).toBe(first.resultMessage.id);
    const referencesAfter = await prisma.contentReference.findMany({
      where: { userId: userAId, sourceUrl: xhsUrl },
    });
    expect(referencesAfter).toHaveLength(1);
    const jobsAfter = await prisma.processingJob.findMany({
      where: { userId: userAId, action: "content.generate" },
    });
    expect(
      new Set(jobsAfter.map((job) => (job.input as { contentId?: string }).contentId)).size,
    ).toBe(contentIds.size);
  });

  it("提炼为选题:创建 Idea,重复提炼不新建", async () => {
    const { jobId } = await runImport(userAId, xhsUrl);
    const source = await createReferenceCardMessage(convAId, jobId, xhsUrl);
    const first = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `idea-1-${runId}`,
      sourceMessageId: source.id,
      cardId: `card-ref-${jobId}`,
      actionId: "reference.extract_idea",
    });
    expect(first.resultMessage.content).toMatch(/提炼为选题|已经存在/);
    const ideas = await prisma.idea.findMany({
      where: { userId: userAId, evidence: { path: ["sourceUrl"], equals: xhsUrl } },
    });
    expect(ideas.length).toBeLessThanOrEqual(1);
  });

  it("跨用户:B 无法在 A 的参考卡上执行动作,也看不到 A 的导入任务", async () => {
    const { jobId } = await runImport(userAId, xhsUrl);
    const source = await createReferenceCardMessage(convAId, jobId, xhsUrl);
    await expect(
      invokeCardAction({
        userId: userBId,
        conversationId: convAId,
        clientActionId: `hijack-${runId}`,
        sourceMessageId: source.id,
        cardId: `card-ref-${jobId}`,
        actionId: "reference.generate_original",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // B 在自己的会话里伪造引用 A 的 jobId 也不行
    const convB = await prisma.conversation.create({
      data: { userId: userBId, title: "B" },
    });
    const forged = await prisma.message.create({
      data: {
        conversationId: convB.id,
        role: "assistant",
        content: "伪造卡",
        status: "complete",
        metadata: {
          protocol: CHAT_PROTOCOL,
          cards: [
            {
              id: `card-ref-${jobId}`,
              version: 1,
              type: "reference",
              state: "ready",
              sourceUrl: xhsUrl,
              jobId,
              actions: referenceCardActions(),
            },
          ],
        },
      },
    });
    await expect(
      invokeCardAction({
        userId: userBId,
        conversationId: convB.id,
        clientActionId: `hijack2-${runId}`,
        sourceMessageId: forged.id,
        cardId: `card-ref-${jobId}`,
        actionId: "reference.generate_original",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("抖音 fixture:导入串联 ASR 子任务", () => {
  it("无转写时创建 transcription.run 子任务(parentJobId 关联);无 Qwen 凭证时子任务 waiting_input", async () => {
    const douyinUrl = "https://www.douyin.com/video/7420000000000000001";
    const { jobId, result } = await runImport(userAId, douyinUrl);
    expect(result.resultType).toBe("benchmarkNote");
    const output = result.output as { transcriptionJobId?: string };
    expect(output.transcriptionJobId).toBeTruthy();

    const child = await prisma.processingJob.findUnique({
      where: { id: output.transcriptionJobId! },
    });
    expect(child!.parentJobId).toBe(jobId);
    expect(child!.action).toBe("transcription.run");

    // 直接执行转写处理器:用户没有 Qwen 凭证 → waiting_input,不返回假转写
    const handler = getJobHandler("transcription.run");
    const asrResult = await handler(
      {
        databaseJobId: child!.id,
        userId: userAId,
        action: "transcription.run",
        input: { noteId: result.resultId! },
      },
      noopProgress,
    );
    expect(asrResult.finalStatus).toBe("waiting_input");
    expect(String((asrResult.output as { reason?: string }).reason)).toContain("QWEN");
    const note = await prisma.benchmarkNote.findUnique({ where: { id: result.resultId! } });
    expect(note!.transcript).toBeNull();
  });
});

describe("普通网页:基础抓取兜底与去重", () => {
  it("无 Firecrawl 凭证时安全基础抓取;重复导入复用同一 Idea;注入文本保持为数据", async () => {
    const webUrl = "http://web.test/article";
    const first = await runImport(userBId, webUrl);
    expect(first.result.resultType).toBe("idea");

    const second = await runImport(userBId, webUrl);
    expect(second.result.resultId).toBe(first.result.resultId);
    expect((second.result.output as { deduplicated?: boolean }).deduplicated).toBe(true);

    const ideas = await prisma.idea.findMany({
      where: { userId: userBId, evidence: { path: ["sourceUrl"], equals: webUrl } },
    });
    expect(ideas).toHaveLength(1);
    expect(ideas[0].title).toContain("晨间流程");
    // 注入文本只是被保存的数据
    expect(ideas[0].notes).toContain("Ignore all previous instructions");
    expect(ideas[0].notes).not.toContain("<script>");
  });

  it("SSRF:导入处理器拒绝私网链接", async () => {
    await expect(runImport(userBId, "http://169.254.169.254/latest/meta-data/")).rejects.toMatchObject(
      { code: "VALIDATION_ERROR" },
    );
  });
});
