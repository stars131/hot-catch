import type {
  ContentKindId,
  ContentLocale,
  PlatformId,
  UiLocale,
} from "@/lib/platforms/registry";
import type {
  DirectionRef,
  DirectionSelection,
} from "@/lib/creator/creative-direction";

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
  | { type: "social_connection"; id: string }
  | { type: "persona"; id: string }
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
  uiLocale?: UiLocale;
};

export type CreationSetupCard = {
  id: string;
  version: 1;
  type: "creation_setup";
  brief: string;
  directionSelection?: DirectionSelection;
  directionSummary?: {
    primaryLabel: string;
    secondaryLabel?: string;
  };
  uiLocale: UiLocale;
  maxPlatforms: 5;
  platformOptions: Array<{
    id: PlatformId;
    label: string;
    description: string;
    group: "domestic" | "global";
  }>;
  localeOptions: Array<{
    id: ContentLocale;
    label: string;
  }>;
  skillOptions: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  accountOptions: Array<{
    id: string;
    platform: PlatformId;
    label: string;
    handle?: string;
    avatarUrl?: string;
    source: "authorized" | "manual";
  }>;
  defaultPlatformIds: PlatformId[];
  defaultLocaleId: ContentLocale;
  defaultSkillIds: string[];
  defaultAccountBindings: Partial<Record<PlatformId, string>>;
  confirmAction: CardAction;
};

export type IdeaCandidatesCard = {
  id: string;
  version: 1;
  type: "idea_candidates";
  brief: string;
  direction: string;
  directionSelection?: DirectionSelection;
  primaryDirectionLabel?: string;
  secondaryDirectionLabel?: string;
  uiLocale: UiLocale;
  candidates: Array<{
    id: string;
    title: string;
    angle: string;
    audience: string;
    reason: string;
  }>;
  chooseAction: CardAction;
  skipAction: CardAction;
};

export type DirectionRecommendationCard = {
  id: string;
  version: 1;
  type: "direction_recommendation";
  decisionId: string;
  brief: string;
  uiLocale: UiLocale;
  source: "model" | "rules";
  intentSummary: string;
  state: "ready" | "needs_input";
  missingInputs: Array<{
    key: string;
    label: string;
    reason: string;
    required: boolean;
    inputType: "text" | "choice";
    options?: string[];
  }>;
  recommendations: Array<{
    id: string;
    ref: DirectionRef;
    label: string;
    summary: string;
    category: string;
    confidence?: number;
    rationale: string;
    fitSignals: string[];
    risks: string[];
    outlinePreview: string[];
    suggestedSecondary?: DirectionRef;
  }>;
  confirmAction: CardAction;
  supplementAction: CardAction;
};

export type DirectionReviewCard = {
  id: string;
  version: 1;
  type: "direction_review";
  contentId: string;
  revisionId: string;
  revisionNumber: number;
  stage: "generation" | "publish";
  status: "passed" | "needs_attention" | "unavailable";
  primaryLabel: string;
  secondaryLabel?: string;
  score?: number;
  summary: string;
  criteria: Array<{
    key: string;
    label: string;
    score: number;
    maxScore: number;
    passed: boolean;
    reason: string;
  }>;
  suggestions: string[];
  actions: CardAction[];
};

export type ReferenceCard = {
  id: string;
  version: 1;
  type: "reference";
  state: "importing" | "ready" | "needs_input" | "failed";
  sourceUrl: string;
  platform?: PlatformId | "web";
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
  platform: PlatformId;
  contentKind: ContentKindId;
  contentLocale?: ContentLocale;
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
  /**
   * 可选实体引用(C8):供客户端把稳定 actionId 映射到应用内路由时取实体 ID,
   * 例如「打开发布中心」按 content 引用预选内容。客户端不得执行卡内任意地址。
   */
  reference?: EntityRef;
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
  | DirectionRecommendationCard
  | DirectionReviewCard
  | CreationSetupCard
  | IdeaCandidatesCard
  | ReferenceCard
  | ProgressCard
  | ArtifactCard
  | ApprovalCard
  | NoticeCard
  | PatchCard
  | PublishReadinessCard;

/**
 * publish.prepare 发布就绪卡(C8)。
 * 汇总平台、内容版本、内容检查项与供应商连接的本地状态;
 * 用户在此卡上显式确认后才移交发布中心,本阶段不接入真实供应商,
 * 移交只是把内容带到 /publish 工作台,不会自动发布、不伪造发布结果。
 * items 由服务端从用户所属版本计算;确认时服务端会按 revisionId 重新校验。
 */
export type PublishReadinessCard = {
  id: string;
  version: 1;
  type: "publish_readiness";
  contentId: string;
  /** 就绪结论基于的版本;确认时若已不是最新版会被安全拦截 */
  revisionId: string;
  revisionNumber: number;
  platform: PlatformId;
  contentKind: ContentKindId;
  title: string;
  /** 内容检查聚合结论 */
  state: "ready" | "warnings" | "blocked";
  /** AiToEarn 凭证的本地配置状态;connected 仅代表已配置,不代表真实可用 */
  connection: "connected" | "missing" | "invalid" | "not_applicable";
  items: Array<{
    key: string;
    label: string;
    level: "pass" | "warn" | "block";
    detail?: string;
  }>;
  actions: CardAction[];
};

export type ChatMessageMetadataV1 = {
  protocol: typeof CHAT_PROTOCOL;
  cards: ChatCard[];
  runId?: string;
};

/** 首批 Agent 命令白名单;LLM 决策必须经服务端白名单校验后才能执行。 */
export const AGENT_COMMANDS = [
  "direction.analyze",
  "direction.confirm",
  "direction.review",
  "reference.import",
  "reference.extract_idea",
  "reference.generate_original",
  "reference.add_to_style_profile",
  "content.create",
  "content.generate",
  "content.generate_bundle",
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
