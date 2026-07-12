import { CredentialProvider, PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type {
  CardAction,
  ChatCard,
  PublishReadinessCard,
} from "@/lib/creator/chat-protocol";
import {
  assessContentReadiness,
  readinessStateLabel,
  type ReadinessAssessment,
  type ReadinessItem,
} from "@/lib/creator/publish-readiness";

/**
 * C8 发布确认与移交(服务端装配)。
 *
 * 职责:
 * - 从当前用户所属的内容项目读取最新版本,用纯校验器生成就绪卡;
 * - 只查本地库判断 AiToEarn 凭证配置状态,绝不调用真实供应商;
 * - 用户在就绪卡上显式确认后,产出「已移交发布中心」结果卡;
 *   本阶段不创建 PublishRecord(发布记录仍由 /publish 工作台在
 *   用户上传素材并最终提交时按既有幂等键创建),也不伪造发布成功。
 */

export type ConnectionState = "connected" | "missing" | "invalid";

export type PublishHandoffReply = {
  text: string;
  cards: ChatCard[];
  command?: string;
};

const IN_FLIGHT_PUBLISH_STATUSES: PublishStatus[] = [
  "draft",
  "scheduled",
  "uploading",
  "submitted",
  "awaiting_user",
];

const PUBLISH_STATUS_LABEL: Record<string, string> = {
  draft: "准备中",
  scheduled: "已定时",
  uploading: "上传中",
  submitted: "已提交",
  awaiting_user: "等待你在抖音确认",
};

/** 只读本地凭证表;connected 仅代表已配置,不代表真实供应商可用。 */
export async function getAiToEarnConnectionState(userId: string): Promise<ConnectionState> {
  const credential = await prisma.providerCredential.findUnique({
    where: {
      userId_provider: { userId, provider: CredentialProvider.aitoearn },
    },
    select: { status: true },
  });
  if (!credential) return "missing";
  return credential.status === "active" ? "connected" : "invalid";
}

function connectionItem(connection: ConnectionState): ReadinessItem {
  if (connection === "connected") {
    return {
      key: "connection.aitoearn",
      label: "供应商连接",
      level: "pass",
      detail: "AiToEarn 凭证已配置(本地状态;真实可用性以发布中心实际加载为准)。",
    };
  }
  if (connection === "invalid") {
    return {
      key: "connection.aitoearn",
      label: "供应商连接",
      level: "warn",
      detail: "AiToEarn 凭证已失效或被撤销:移交后无法加载发布账号,请到「设置 → 连接」重新配置。",
    };
  }
  return {
    key: "connection.aitoearn",
    label: "供应商连接",
    level: "warn",
    detail: "尚未配置 AiToEarn 凭证:移交后无法加载发布账号,请先到「设置 → 连接」完成配置。",
  };
}

async function loadContentWithLatestRevision(userId: string, contentId: string) {
  const content = await prisma.generatedContent.findFirst({
    where: { id: contentId, userId },
    include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
  });
  if (!content) {
    throw new AppError("NOT_FOUND", "内容项目不存在,或不属于当前账号。", 404);
  }
  return { content, latest: content.revisions[0] ?? null };
}

/** 组装就绪卡的检查项:内容检查 + 供应商连接 + 在途发布记录提醒。 */
async function collectReadiness(params: {
  userId: string;
  contentId: string;
  contentKind: "xhs_graphic" | "douyin_video_script";
  title: string | null;
  bodyText: string | null;
  structuredContent: unknown;
  fallbackTags: string[];
}): Promise<{ assessment: ReadinessAssessment; connection: ConnectionState; items: ReadinessItem[] }> {
  const structured =
    params.structuredContent &&
    typeof params.structuredContent === "object" &&
    !Array.isArray(params.structuredContent)
      ? (params.structuredContent as Record<string, unknown>)
      : null;
  const assessment = assessContentReadiness({
    contentKind: params.contentKind,
    title: params.title ?? "",
    body: params.bodyText ?? "",
    structured,
    fallbackTags: params.fallbackTags,
  });
  const connection = await getAiToEarnConnectionState(params.userId);
  const items: ReadinessItem[] = [...assessment.items, connectionItem(connection)];

  const inFlight = await prisma.publishRecord.findFirst({
    where: {
      userId: params.userId,
      contentId: params.contentId,
      status: { in: IN_FLIGHT_PUBLISH_STATUSES },
    },
    orderBy: { createdAt: "desc" },
    select: { status: true, createdAt: true },
  });
  if (inFlight) {
    items.push({
      key: "publish.inflight",
      label: "进行中的发布",
      level: "warn",
      detail: `这条内容已有一条「${PUBLISH_STATUS_LABEL[inFlight.status] ?? inFlight.status}」的发布记录(${inFlight.createdAt.toLocaleString("zh-CN")});重复提交可能造成重复发布,请先到发布中心处理。`,
    });
  }
  return { assessment, connection, items };
}

function readinessActions(params: {
  state: "ready" | "warnings" | "blocked";
  connection: ConnectionState;
  hasPending: boolean;
}): CardAction[] {
  const actions: CardAction[] = [];
  if (params.state !== "blocked") {
    actions.push({
      actionId: "publish.confirm_handoff",
      label: "确认并移交发布中心",
      appearance: "primary",
      requiresConfirmation: true,
    });
  }
  actions.push({
    actionId: "publish.open_checklist",
    label: "打开检查清单",
    repeatable: true,
  });
  if (params.hasPending) {
    actions.push({
      actionId: "publish.copy_missing",
      label: "复制待处理项",
      repeatable: true,
    });
  }
  if (params.connection !== "connected") {
    actionsWithConnection(actions);
  }
  actions.push({
    actionId: "publish.prepare",
    label: "重新检查",
    appearance: "ghost",
    repeatable: true,
  });
  return actions;
}

function actionsWithConnection(actions: CardAction[]) {
  actions.push({
    actionId: "connection.open",
    label: "打开连接设置",
    repeatable: true,
  });
}

/**
 * 生成发布就绪回复(publish.prepare):
 * 对最新已保存版本做只读评估,产出 publish_readiness 卡;不产生任何发布动作。
 */
export async function buildPublishReadinessReply(params: {
  userId: string;
  contentId: string;
  /** 卡片 id 后缀(通常用 runId 尾部),保证同会话内可多次重新检查 */
  cardIdSuffix: string;
}): Promise<PublishHandoffReply> {
  const { content, latest } = await loadContentWithLatestRevision(
    params.userId,
    params.contentId,
  );
  // 空字符串标题(阻塞内容)也要兜底,否则就绪卡会因 title 为空过不了协议校验
  const title = latest?.title || content.title || "未命名内容";

  if (!latest) {
    return {
      text: `「${title}」还没有任何已保存版本,先在编辑器保存或生成一版内容,再发起发布准备。`,
      cards: [
        {
          id: `notice-publish-norev-${params.cardIdSuffix}`,
          version: 1,
          type: "notice",
          tone: "warning",
          title: "还没有可发布的版本",
          body: "发布只针对已落库的内容版本;正式内容保存后就会出现在这里。",
        },
      ],
      command: "publish.prepare",
    };
  }

  const { connection, items } = await collectReadiness({
    userId: params.userId,
    contentId: content.id,
    contentKind: content.contentKind as "xhs_graphic" | "douyin_video_script",
    title: latest.title,
    bodyText: latest.bodyText,
    structuredContent: latest.structuredContent,
    fallbackTags: content.tags,
  });
  const blockers = items.filter((item) => item.level === "block").length;
  const warnings = items.filter((item) => item.level === "warn").length;
  const state: PublishReadinessCard["state"] = blockers
    ? "blocked"
    : warnings
      ? "warnings"
      : "ready";

  const card: PublishReadinessCard = {
    id: `card-publish-ready-${params.cardIdSuffix}`,
    version: 1,
    type: "publish_readiness",
    contentId: content.id,
    revisionId: latest.id,
    revisionNumber: latest.revisionNumber,
    platform: content.platform as "xiaohongshu" | "douyin",
    contentKind: content.contentKind as "xhs_graphic" | "douyin_video_script",
    title,
    state,
    connection,
    items,
    actions: readinessActions({
      state,
      connection,
      hasPending: blockers + warnings > 0,
    }),
  };

  const summary =
    state === "blocked"
      ? `发现 ${blockers} 项阻塞问题,先处理后再移交发布中心。`
      : state === "warnings"
        ? `内容可以移交,但有 ${warnings} 项提醒建议先确认。`
        : "各项检查已通过。";
  return {
    text: `「${title}」v${latest.revisionNumber} 的发布就绪检查(${readinessStateLabel(state)}):${summary}移交后仍需你在发布中心上传素材并手动确认;当前阶段未接入真实供应商,系统不会自动发布。`,
    cards: [card],
    command: "publish.prepare",
  };
}

/**
 * 用户在就绪卡上显式确认(publish.confirm_handoff):
 * 服务端重新校验归属、版本是否仍为最新、内容是否仍无阻塞,
 * 全部通过才产出移交结果;不创建发布记录、不调用供应商。
 */
export async function confirmPublishHandoff(params: {
  userId: string;
  card: PublishReadinessCard;
  sourceMessageId: string;
}): Promise<PublishHandoffReply> {
  const { content, latest } = await loadContentWithLatestRevision(
    params.userId,
    params.card.contentId,
  );
  const suffix = params.sourceMessageId.slice(-8);

  if (!latest) {
    return {
      text: "这条内容已没有可发布的版本,没有执行移交。",
      cards: [
        {
          id: `notice-handoff-norev-${suffix}`,
          version: 1,
          type: "notice",
          tone: "warning",
          title: "未移交:没有可发布版本",
        },
      ],
    };
  }

  // 安全拦截:就绪结论基于的版本已不是最新版时不移交,请重新检查;不覆盖任何数据
  if (latest.id !== params.card.revisionId) {
    return {
      text: `没有移交:就绪检查基于 v${params.card.revisionNumber},内容已更新到 v${latest.revisionNumber},结论可能过期。请点「重新检查」后再确认。`,
      cards: [
        {
          id: `notice-handoff-stale-${suffix}`,
          version: 1,
          type: "notice",
          tone: "warning",
          title: "就绪结论已过期,未移交",
          body: `检查基于 v${params.card.revisionNumber},当前最新为 v${latest.revisionNumber}。`,
        },
      ],
    };
  }

  // 确认时重新评估,不信任卡片自带结论(防御手动构造的卡片元数据)
  const { connection, items } = await collectReadiness({
    userId: params.userId,
    contentId: content.id,
    contentKind: content.contentKind as "xhs_graphic" | "douyin_video_script",
    title: latest.title,
    bodyText: latest.bodyText,
    structuredContent: latest.structuredContent,
    fallbackTags: content.tags,
  });
  const blockers = items.filter((item) => item.level === "block");
  if (blockers.length > 0) {
    return {
      text: `没有移交:内容当前有 ${blockers.length} 项阻塞问题(${blockers
        .map((item) => item.label)
        .join("、")}),请处理后重新发起「准备发布」。`,
      cards: [
        {
          id: `notice-handoff-blocked-${suffix}`,
          version: 1,
          type: "notice",
          tone: "error",
          title: "未移交:存在阻塞问题",
          body: blockers.map((item) => `${item.label}:${item.detail ?? ""}`).join("\n"),
        },
      ],
    };
  }

  const title = latest.title || content.title || "未命名内容";
  const connectionHint =
    connection === "connected"
      ? "请在发布中心核对版本与账号、上传素材后手动确认发布。"
      : "尚未配置可用的 AiToEarn 凭证:发布中心暂时无法加载账号,请先完成连接再发布。";
  const noticeActions: CardAction[] = [
    {
      actionId: "publish.open_workspace",
      label: "打开发布中心",
      appearance: "primary",
      repeatable: true,
    },
  ];
  if (connection !== "connected") {
    actionsWithConnection(noticeActions);
  }

  return {
    text: `已确认把「${title}」v${latest.revisionNumber} 移交到发布中心。${connectionHint}当前阶段未接入真实供应商:系统不会自动发布,也不会伪造发布结果;发布记录会在你于发布中心提交时才创建。`,
    cards: [
      {
        id: `notice-handoff-ok-${suffix}`,
        version: 1,
        type: "notice",
        tone: connection === "connected" ? "success" : "warning",
        title: "已移交发布中心(待你手动发布)",
        body: connectionHint,
        reference: { type: "content", id: content.id },
        actions: noticeActions,
      },
    ],
    command: "publish.prepare",
  };
}
