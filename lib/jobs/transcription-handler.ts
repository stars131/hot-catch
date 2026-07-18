import { CredentialProvider, Prisma } from "@prisma/client";
import { isAppError } from "@/lib/errors";
import { registerJobHandler } from "@/lib/jobs/handlers";
import type { JobHandler } from "@/lib/jobs/types";
import { prisma } from "@/lib/prisma";
import { normalizeContent } from "@/lib/providers/tikhub/normalizer";
import { QwenAsrProvider } from "@/lib/providers/qwen-asr/provider";
import { loadCredential } from "@/lib/services/credential-service";
import { createLlmProvider } from "@/lib/providers/factory";
import { videoAnalysisSchema } from "@/lib/validators/video-analysis";

const transcriptionHandler: JobHandler = async (payload, reportProgress) => {
  const noteId = (payload.input as { noteId?: string }).noteId;
  if (!noteId) throw new Error("noteId is required");
  const note = await prisma.benchmarkNote.findFirst({
    where: { id: noteId, account: { userId: payload.userId, platform: "douyin" } },
    include: { account: true },
  });
  if (!note || !note.account) throw new Error("抖音作品不存在或不属于当前用户。");
  const normalized = normalizeContent(
    "douyin",
    note.rawData,
    note.platformContentId ?? note.noteId ?? undefined,
    note.noteUrl ?? undefined,
  );
  if (!normalized.mediaUrl) {
    return {
      finalStatus: "waiting_input",
      output: { reason: "MEDIA_URL_REQUIRED", message: "作品没有可下载的视频地址，请手工补充。" },
    };
  }

  let asrCredential;
  try {
    asrCredential = await loadCredential(payload.userId, CredentialProvider.qwen_asr);
  } catch (error) {
    if (isAppError(error) && error.code === "CREDENTIAL_NOT_CONFIGURED") {
      return {
        finalStatus: "waiting_input",
        output: { reason: "QWEN_ASR_CREDENTIAL_REQUIRED", message: "请先配置 Qwen-ASR 凭证。" },
      };
    }
    throw error;
  }
  const apiKey = asrCredential.apiKey ?? asrCredential.token;
  if (!apiKey) throw new Error("Qwen-ASR 凭证缺少 apiKey。");
  const workspaceId = asrCredential.workspaceId || "";
  const baseUrl =
    asrCredential.baseUrl ||
    (workspaceId
      ? `https://${workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
      : envBaseUrl());
  await reportProgress(20, "下载并提取音频");
  const transcription = await new QwenAsrProvider(apiKey, baseUrl).transcribe({
    sourceUrl: normalized.mediaUrl,
    language: "zh",
    idempotencyKey: note.id,
  });
  await prisma.benchmarkNote.update({
    where: { id: note.id },
    data: { transcript: transcription.text },
  });

  await reportProgress(70, "分析视频运营结构");
  let analysis: unknown;
  try {
    const llm = await createLlmProvider(payload.userId);
    analysis = await llm.generateStructured({
      system: "你是短视频运营分析师。只依据转写和已有元数据分析，不臆测画面细节；输出 JSON。",
      prompt: `标题：${note.title ?? ""}\n时长：${note.durationSec ?? normalized.durationSec ?? "未知"} 秒\n转写：${transcription.text}\n分析脚本类型、开场、爆点、情绪曲线、画面感、人设角色、节奏、改进建议和风险。`,
      schema: videoAnalysisSchema,
      temperature: 0.2,
    });
    await prisma.benchmarkNote.update({
      where: { id: note.id },
      data: { analysis: analysis as Prisma.InputJsonValue },
    });
  } catch (error) {
    if (!isAppError(error) || error.code !== "CREDENTIAL_NOT_CONFIGURED") throw error;
  }
  return {
    resultType: "benchmarkNote",
    resultId: note.id,
    output: { transcriptLength: transcription.text.length, analysisPending: !analysis },
  };
};

function envBaseUrl() {
  return process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1";
}

registerJobHandler("transcription.run", transcriptionHandler);
