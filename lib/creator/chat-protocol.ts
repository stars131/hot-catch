/**
 * star-chat/v1 会话卡片协议的稳定类型定义。
 *
 * 该文件只描述协议形状,不做运行时校验;运行时校验见 chat-schemas.ts。
 * 卡片保存在 Message.metadata,正文始终保留纯文本兜底。
 * 客户端点击只回传 messageId + cardId + actionId + values,
 * 服务端必须从当前用户拥有的原消息中解析真实动作与实体。
 */

export const CHAT_PROTOCOL = "star-chat/v1" as const;

export const CHAT_PROTOCOL_VERSION = 1 as const;

export type EntityRef =
  | { type: "idea"; id: string }
  | { type: "benchmark_account"; id: string }
  | { type: "benchmark_note"; id: string }
  | { type: "content"; id: string }
  | { type: "content_revision"; id: string }
  | { type: "style_profile"; id: string };

export type CardAction = {
  actionId: string;
  label: string;
  appearance?: "primary" | "secondary" | "ghost" | "danger";
  repeatable?: boolean;
  requiresConfirmation?: boolean;
};

export type OptionCard = {
  id: string;
  version: 1;
  type: "option";
  title: string;
  mode: "single" | "multiple";
  options: Array<{
    id: string;
    label: string;
    description?: string;
    recommended?: boolean;
  }>;
  submitAction: CardAction;
};

export type ReferenceCard = {
  id: string;
  version: 1;
  type: "reference";
  state: "importing" | "ready" | "needs_input" | "failed";
  sourceUrl: string;
  platform?: "xiaohongshu" | "douyin" | "web";
  /** 关联导入任务;客户端轮询该任务驱动卡片状态 */
  jobId?: string;
  reference?: EntityRef;
  author?: string;
  coverUrl?: string;
  summary?: string;
  evidence?: Array<{ label: string; excerpt: string }>;
  actions?: CardAction[];
};

export type ProgressCard = {
  id: string;
  version: 1;
  type: "progress";
  jobId: string;
  title: string;
  display: "compact" | "steps";
  cancelable?: boolean;
};

export type ArtifactCard = {
  id: string;
  version: 1;
  type: "artifact";
  contentId: string;
  revisionId: string;
  revisionNumber: number;
  platform: "xiaohongshu" | "douyin";
  contentKind: "xhs_graphic" | "douyin_video_script";
  title: string;
  preview?: string;
  score?: number;
  actions: CardAction[];
};

export type ApprovalCard = {
  id: string;
  version: 1;
  type: "approval";
  title: string;
  summary: string;
  risk: "low" | "medium" | "high";
  confirmAction: CardAction;
  cancelAction: CardAction;
};

export type NoticeCard = {
  id: string;
  version: 1;
  type: "notice";
  tone: "info" | "warning" | "error" | "success";
  title: string;
  body?: string;
  actions?: CardAction[];
};

/**
 * content.propose_patch 提案卡(C7)。
 * origin 固定为 local_preview:当前提案由本地确定性规则生成,
 * 是协议预览而非真实 AI 产出;接入 DeepSeek 后 origin 才会扩展。
 * before/after 是服务端从用户所属版本读取并生成的文本,
 * 应用时服务端仍会按 revisionId + before 重新校验,不信任卡片内容本身。
 */
export type PatchCard = {
  id: string;
  version: 1;
  type: "patch";
  contentId: string;
  /** 提案基于的版本;应用时若已不是最新版会被安全拦截 */
  revisionId: string;
  revisionNumber: number;
  contentKind: "xhs_graphic" | "douyin_video_script";
  section: {
    kind: "title" | "body" | "hook" | "interaction" | "page" | "shot";
    index?: number;
  };
  sectionLabel: string;
  skillId: string;
  instruction: string;
  before: string;
  after: string;
  note?: string;
  origin: "local_preview";
  actions: CardAction[];
};

export type ChatCard =
  | OptionCard
  | ReferenceCard
  | ProgressCard
  | ArtifactCard
  | ApprovalCard
  | NoticeCard
  | PatchCard;

export type ChatMessageMetadataV1 = {
  protocol: typeof CHAT_PROTOCOL;
  cards: ChatCard[];
  runId?: string;
};

/** 首批 Agent 命令白名单;LLM 决策必须经服务端白名单校验后才能执行。 */
export const AGENT_COMMANDS = [
  "reference.import",
  "reference.extract_idea",
  "reference.generate_original",
  "reference.add_to_style_profile",
  "content.create",
  "content.generate",
  "content.propose_patch",
  "content.apply_patch",
  "content.score",
  "content.save_revision",
  "content.restore_revision",
  "job.retry",
  "job.cancel",
  "connection.open",
  "publish.prepare",
] as const;

export type AgentCommand = (typeof AGENT_COMMANDS)[number];
