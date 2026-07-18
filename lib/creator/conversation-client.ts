"use client";

/**
 * C3 会话客户端:接入 /api/conversations/:id/messages、actions 与 /api/agent-runs。
 * 旧 /api/chat 不再被新 UI 调用(服务端保留为 legacy 适配器)。
 */

import { readApiJson } from "@/lib/api-client";
import {
  parseChatMessageMetadata,
  type PatchTarget,
  type PublishTarget,
} from "@/lib/creator/chat-schemas";
import type { ChatCard, EntityRef } from "@/lib/creator/chat-protocol";
import type { SkillCatalogItem } from "@/lib/skills/catalog";

export type MessageStatus = "pending" | "complete" | "failed";

export type ThreadMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  status: MessageStatus;
  cards: ChatCard[];
  createdAt: string;
  clientMessageId: string | null;
};

export type ActiveRun = {
  id: string;
  status: "pending" | "running" | "waiting_input";
  command: string | null;
};

export type RunTrace = {
  id: string;
  status: string;
  command: string | null;
  errorCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  contextVersion: { modelName: string | null } | null;
  jobs: Array<{ id: string; status: string; stage: string | null; progress: number; errorCode: string | null }>;
};

export type ConversationCheckpoint = {
  id: string;
  summary: string;
  ledger: unknown;
  messageCount: number;
  tokenEstimate: number;
  createdAt: string;
};

export type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
  preview: string | null;
};

export type ContentContext = {
  id: string;
  title: string | null;
  platform: "xiaohongshu" | "douyin";
};

type RawMessage = {
  id: string;
  role: ThreadMessage["role"];
  content: string;
  status: MessageStatus;
  metadata: unknown;
  createdAt: string;
  clientMessageId: string | null;
};

function toThreadMessage(raw: RawMessage): ThreadMessage {
  return {
    id: raw.id,
    role: raw.role,
    content: raw.content,
    status: raw.status,
    cards: parseChatMessageMetadata(raw.metadata)?.cards ?? [],
    createdAt: raw.createdAt,
    clientMessageId: raw.clientMessageId,
  };
}

/** 与服务端一致的动作幂等键;客户端用它判断卡片是否已处理。 */
export function actionKeyOf(cardId: string, actionId: string): string {
  return `action:${cardId}:${actionId}`;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const data = await readApiJson<{
    conversations: Array<{
      id: string;
      title: string | null;
      updatedAt: string;
      messages?: Array<{ content: string }>;
    }>;
  }>(await fetch("/api/conversations", { cache: "no-store" }));
  return data.conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    updatedAt: conversation.updatedAt,
    preview: conversation.messages?.[0]?.content?.slice(0, 60) ?? null,
  }));
}

export async function createConversation(title: string): Promise<{ id: string }> {
  const data = await readApiJson<{ conversation: { id: string } }>(
    await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );
  return { id: data.conversation.id };
}

export async function listSkills(): Promise<SkillCatalogItem[]> {
  const data = await readApiJson<{ skills: SkillCatalogItem[] }>(
    await fetch("/api/settings/skills", { cache: "no-store" }),
  );
  return data.skills;
}

export async function listMessages(conversationId: string): Promise<{
  messages: ThreadMessage[];
  processedActionKeys: string[];
  activeRun: ActiveRun | null;
  activeSkillIds: string[];
  runTraces: RunTrace[];
  checkpoints: ConversationCheckpoint[];
}> {
  const data = await readApiJson<{
    messages: RawMessage[];
    processedActionKeys: string[];
    activeRun: ActiveRun | null;
    activeSkillIds: string[];
    runTraces: RunTrace[];
    checkpoints: ConversationCheckpoint[];
  }>(await fetch(`/api/conversations/${conversationId}/messages`, { cache: "no-store" }));
  return {
    messages: data.messages.map(toThreadMessage),
    processedActionKeys: data.processedActionKeys,
    activeRun: data.activeRun,
    activeSkillIds: data.activeSkillIds,
    runTraces: data.runTraces,
    checkpoints: data.checkpoints,
  };
}

export async function sendMessage(
  conversationId: string,
  text: string,
  options?: {
    patchTarget?: PatchTarget;
    publishTarget?: PublishTarget;
    skillIds?: string[];
    entityRefs?: EntityRef[];
  },
): Promise<{ userMessage: ThreadMessage; assistantMessage: ThreadMessage; runId: string | null }> {
  const context = {
    ...(options?.skillIds !== undefined ? { skillIds: options.skillIds } : {}),
    ...(options?.patchTarget ? { patchTarget: options.patchTarget } : {}),
    ...(options?.publishTarget ? { publishTarget: options.publishTarget } : {}),
  };
  const data = await readApiJson<{
    userMessage: RawMessage;
    assistantMessage: RawMessage | null;
    run: { id: string } | null;
  }>(
    await fetch(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientMessageId: `cm-${crypto.randomUUID()}`,
        parts: [
          { type: "text", text },
          ...(options?.entityRefs ?? []).map((reference) => ({ type: "entity" as const, reference })),
        ],
        ...(Object.keys(context).length ? { context } : {}),
      }),
    }),
  );
  return {
    userMessage: toThreadMessage(data.userMessage),
    assistantMessage: data.assistantMessage
      ? toThreadMessage(data.assistantMessage)
      : toThreadMessage({ ...data.userMessage, id: `${data.userMessage.id}-missing`, role: "assistant", content: "", status: "failed", metadata: null }),
    runId: data.run?.id ?? null,
  };
}

export async function invokeAction(
  conversationId: string,
  params: {
    sourceMessageId: string;
    cardId: string;
    actionId: string;
    values?: { optionIds?: string[]; text?: string };
  },
): Promise<{ resultMessage: ThreadMessage; replayed: boolean }> {
  const data = await readApiJson<{ resultMessage: RawMessage; replayed: boolean }>(
    await fetch(`/api/conversations/${conversationId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientActionId: `ca-${crypto.randomUUID()}`,
        sourceMessageId: params.sourceMessageId,
        cardId: params.cardId,
        actionId: params.actionId,
        ...(params.values ? { values: params.values } : {}),
      }),
    }),
  );
  return { resultMessage: toThreadMessage(data.resultMessage), replayed: data.replayed };
}

export async function getRun(runId: string): Promise<{ id: string; status: string }> {
  const data = await readApiJson<{ run: { id: string; status: string } }>(
    await fetch(`/api/agent-runs/${runId}`, { cache: "no-store" }),
  );
  return data.run;
}

export async function cancelRun(runId: string): Promise<void> {
  await readApiJson(
    await fetch(`/api/agent-runs/${runId}/cancel`, { method: "POST" }),
  );
}

/** 读取 /ideas 跳转带来的内容项目上下文(标题作为 Chip 展示)。 */
export async function getContentContext(contentId: string): Promise<ContentContext> {
  const data = await readApiJson<{
    content: { id: string; title: string | null; platform: "xiaohongshu" | "douyin" };
  }>(await fetch(`/api/content/${contentId}`, { cache: "no-store" }));
  return {
    id: data.content.id,
    title: data.content.title,
    platform: data.content.platform,
  };
}
