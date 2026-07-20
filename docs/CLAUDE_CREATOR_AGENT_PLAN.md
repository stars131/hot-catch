# 星迹内容助手：Claude 后续执行计划

> 版本：2026-07-11  
> 当前阶段：底层能力已部分落地，创作体验需要结构性重做  
> 执行方式：Claude 每次只领取一个批次，完成验证后等待用户验收

## 1. 最终产品判断

设计判断：这是给个人创作者长期使用的 Agent 工作台，不是 CMS、数据后台或参数配置面板。视觉应克制、轻量、接近 ChatGPT 桌面端；交互采用：

**ChatGPT 的对话骨架 + Claude 的 Artifact + Manus 的任务过程 + Perplexity 的证据管理。**

这不是像素级复制，也不复制任何产品的 Logo、文案和专属图标。需要模仿的是成熟的交互关系：

- 会话是主界面。
- 用户先描述结果，不先填完一整页表单。
- Agent 在对话中提出选项、解释计划、执行工具、等待确认。
- 长内容先作为对话内成果块出现，点击后再侧边或全屏精细编辑。
- 参考来源、版本、评分和任务状态按需展开，不常驻挤压正文。

官方参考：

- [ChatGPT Writing Blocks](https://help.openai.com/en/articles/20001246-working-with-writing-blocks-and-code-blocks-in-chatgpt)：草稿直接出现在对话中，可编辑、局部修改、全屏和自动保存。
- [ChatGPT Canvas](https://help.openai.com/en/articles/9930697-what-is-the-canvas-featue-in-chatgpt-and-how-do-i-use-it)：聊天与右侧可编辑成果协同，支持版本恢复。
- [ChatGPT Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)：会话、文件和项目上下文长期保存。
- [Claude Artifacts](https://support.anthropic.com/en/articles/9487310-what-are-artifacts-and-how-do-i-use-them)：独立成果窗口、版本与迭代。
- [Manus Projects](https://manus.im/docs/features/projects)：持久项目、共享说明和资料。
- [Perplexity Assets](https://www.perplexity.ai/help-center/en/articles/12528830-creating-assets-with-perplexity-overview)：成果侧栏预览、全屏、版本和证据。

## 2. 用户新增的四条硬约束

以下均为 P0，不是以后再做：

1. **实际内容创作使用对话方式。** 用户可以只输入自然语言，不需要先填写“项目标题、简报、选题、风格”整套表单。
2. **Agent 可以提供卡片选项。** 平台、方向、语气、页数/时长、参考使用方式、确认和恢复操作，都可以在消息流里用单选、多选或行动卡完成。
3. **保留外接 Skill 的可能性。** 当前先建立受控 Skill 协议和内置注册表；未来接 HTTP/MCP Skill 时，聊天 UI 不重写。
4. **导入其他人的公开或已授权链接后可以一键生成参考内容。** 导入成功先显示来源证据和可复用结构，再提供“参考结构生成原创稿”等按钮，全程不要求跳去另一个表单页。

“一键参考生成”不等于照抄：

- 只处理用户本人、已授权或公开内容。
- 不冒充原作者，不复制完整正文，不做声音或身份仿造。
- 提取主题、结构、钩子、节奏、论证方式、视觉语言和边界。
- 生成内容必须保留来源证据与参考说明。

## 3. 当前代码基线与真实完成度

### 3.1 已验证通过

本轮实际执行并通过：

- `npm run typecheck`
- `npm run lint -- --max-warnings=0`
- 单元测试：5 个文件，13 个用例
- 供应商契约测试：3 个文件，5 个用例
- 集成测试：5 个文件，9 个用例

已经存在且应保留：

- Next.js 15、React 18、Tailwind 3、Prisma、PostgreSQL。
- Auth.js 邀请制基础、Resend 魔法链接路径、开发身份旁路限制。
- AES-256-GCM 用户级凭证。
- Redis + BullMQ 的 `ingest / analysis / publish / metrics` 队列。
- TikHub、Qwen-ASR、DeepSeek、AiToEarn、Firecrawl 适配器和脱敏契约夹具。
- `Idea`、风格画像、结构化内容、版本、评分、发布、指标、复盘模型和服务。
- 小红书图文与抖音逐秒分镜结构 Schema。
- 发布幂等、`awaiting_user`、抖音短链、D+1/D+3/D+7 任务基础。
- Docker 开发环境、生产 Compose/Caddy/备份文档基础。

### 3.2 不能声称完成

| 原计划范围 | 当前证据 | 结论 |
|---|---|---|
| 邀请制认证与隔离 | 代码和集成测试存在，真实 Resend 登录未演练 | 部分完成 |
| TikHub 小红书 20 样本 ≥90% | 只有适配器和固定契约夹具 | 未验收 |
| TikHub 抖音 20 样本 ≥90% | 只有适配器和固定契约夹具 | 未验收 |
| Qwen-ASR 真实转写 | 合同夹具和临时文件逻辑存在 | 未验收 |
| 证据化风格画像完整 UI | 后端存在，创作页只能选择已审核画像 | 未完成 |
| 双平台内容工作台 | 字段齐全，但交互架构被用户否决 | 必须重做 |
| AiToEarn 真实授权/上传/发布 | 适配器和 UI 基础存在 | 未验收 |
| 连续 5 次真实或沙箱发布 | 无真实记录证据 | 未验收 |
| D+1/D+3/D+7 准点率 | 只有队列与处理器 | 未验收 |
| Linux 内测部署和恢复演练 | 编排文件和文档存在 | 未部署、未演练 |
| 3–5 名内测用户 | 无外部验收证据 | 未开始 |

### 3.3 当前创作页为什么失败

当前 `components/creator-workbench.tsx` 约 42KB，结构是：

```text
先填项目表单
  ↓
左侧 310px 小聊天
+ 中间大量内容表单
+ 右侧 290px 评分/版本/导出
```

主要问题：

- 未创建项目时根本看不到对话，第一屏像 CMS 新建表单。
- 聊天是最小的一栏，不是主流程。
- “生成初稿”依赖顶部按钮，不由对话触发。
- 消息只保存在本地 state，刷新即回到欢迎语；服务端会话列表没有接入 UI。
- 当前 `/api/chat` 仍是旧小红书命令式逻辑，不理解抖音、当前内容、版本、选题或任务。
- Agent 工具执行只有一条进度条；`waiting_input`、失败和恢复主要靠 Toast。
- 小红书分页和抖音分镜把所有字段同时暴露，卡片套卡片，像后台录入系统。
- 移动端把三栏纵向堆叠，聊天、正文和版本无法自然切换。
- 恢复版本存在旧闭包保存错误风险；生成结束重新加载也可能覆盖等待期间的人工修改。

结论：不要继续改当前三栏的颜色、卡片和间距。必须换创作壳层和 Agent 编排，但保留已经完成的 Provider、队列、结构化内容和版本服务。

## 4. 目标信息架构

### 4.1 空会话与普通对话

```text
┌──────── 248px ────────┬────────────── 对话主区 ──────────────┐
│ ＋ 新建创作           │ 顶栏：会话名 / 平台 / 状态 / 作品入口 │
│                       │                                       │
│ 创作 / 热点 / 选题    │ Agent 与用户的连续消息                │
│ 发布 / 复盘           │ 卡片选项、参考卡、任务卡、成果块      │
│                       │                                       │
│ 今天                  │                                       │
│ 最近创作会话          │          悬浮 Composer                │
│                       │                                       │
│ 连接 / 设置           │                                       │
└───────────────────────┴───────────────────────────────────────┘
```

空白页只显示：

- 一句主标题，例如“今天想创作什么？”
- Composer。
- 3–4 个轻量快捷入口：从选题库开始、导入对标作品、写小红书、生成抖音分镜。

不要显示：

- 项目标题表单。
- 大块账号/人设/风格选择表单。
- 评分、版本、导出、发布卡片。
- 一整页功能说明。

### 4.2 成果打开时

```text
┌── 248px ──┬── 对话 420–500px ──┬──── Artifact 560–720px ────┐
│ 会话列表  │ 对话、过程、Composer │ 内容 / 结构 / 评分与证据    │
│           │                      │ 版本 / 保存状态 / 发布入口   │
└───────────┴──────────────────────┴─────────────────────────────┘
```

规则：

- Artifact 默认关闭，不永久占据右侧。
- 内容生成成功后先出现对话内成果块，可自动打开 Artifact，但用户可以关闭。
- 小于 1180px 时隐藏会话栏，Artifact 覆盖主区。
- 手机一次只显示对话或 Artifact，不做压缩三栏。

### 4.3 左侧栏

- 顶部固定“新建创作”。
- 一级入口只保留：创作、热点、选题、发布、复盘。
- 中部是会话列表，按今天/近 7 天/更早分组。
- 每条只显示标题、平台图标和一个状态：草稿、需要处理、已评分、待发布、已发布。
- 设置和连接放底部。
- 创作路由使用专用 `CreatorShell`；现有 `AppShell` 继续服务热点、选题、发布、复盘和设置。

## 5. 对话式创作的完整流程

### 5.1 无参考链接

```text
用户：帮我写一篇关于“AI 面试复盘”的小红书，给刚毕业的人看
  ↓
Agent：理解需求，并在缺少必要信息时给出卡片
  [经验分享，推荐] [步骤清单] [反常识观点]
  ↓
用户点击“步骤清单”
  ↓
Agent：显示可折叠执行过程
  ✓ 读取选题
  ✓ 应用已审核风格画像
  ● 生成分页结构
  ○ 发布前评分
  ↓
完成后显示 Artifact 卡
  [打开编辑] [继续优化] [导出] [准备发布]
```

如果用户已经说清楚平台、受众和目标，Agent 不要为了展示卡片而重复提问。卡片只用于真正影响结果的选择。

### 5.2 粘贴作品链接后一键生成

```text
用户粘贴小红书/抖音/网页链接
  ↓
前端确定性识别 URL，不先交给 LLM
  ↓
reference.import 任务
  ↓
消息内 ReferenceCard：导入中 / 需凭证 / 失败 / 已完成
  ↓
生成 ReferenceBrief：主题、受众、钩子、结构、节奏、证据、边界
  ↓
显示动作：
  [参考结构生成原创稿]
  [提炼为选题]
  [加入参考集]
  [构建/补充风格画像]
  [查看证据]
  ↓
点击“参考结构生成原创稿”
  ↓
自动创建内容项目与 ContentReference
  ↓
content.generate → ContentRevision → ArtifactCard
```

抖音作品无转写时自动串联：

```text
reference.import → transcription.run → reference.analyze → content.generate
```

四个任务挂在同一个 Agent Run 下，用户看到的是一个聚合进度卡，而不是四条技术日志。

### 5.3 对话修改内容

支持自然语言：

- “把开头改得更具体。”
- “给我 3 个更克制的标题。”
- “第 3 页和第 4 页重复了，合并一下。”
- “把抖音脚本压到 30 秒。”
- “这个表达不像我，换成更直接的语气。”

Agent 先生成结构化 Patch/Diff，再显示：

- 变更位置。
- 修改前/修改后摘要。
- 接受、拒绝、重新生成。

用户接受后创建新 `ContentRevision`。不允许直接覆盖当前版本。

## 6. 消息卡片协议

卡片保存在 `Message.metadata`，正文保留纯文本兜底。所有 metadata 必须用 Zod 校验并带协议版本。

```ts
export const CHAT_PROTOCOL = "star-chat/v1" as const;

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

export type ChatCard =
  | {
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
    }
  | {
      id: string;
      version: 1;
      type: "reference";
      state: "importing" | "ready" | "needs_input" | "failed";
      sourceUrl: string;
      platform?: "xiaohongshu" | "douyin" | "web";
      reference?: EntityRef;
      author?: string;
      coverUrl?: string;
      summary?: string;
      evidence?: Array<{ label: string; excerpt: string }>;
      actions?: CardAction[];
    }
  | {
      id: string;
      version: 1;
      type: "progress";
      jobId: string;
      title: string;
      display: "compact" | "steps";
      cancelable?: boolean;
    }
  | {
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
    }
  | {
      id: string;
      version: 1;
      type: "approval";
      title: string;
      summary: string;
      risk: "low" | "medium" | "high";
      confirmAction: CardAction;
      cancelAction: CardAction;
    }
  | {
      id: string;
      version: 1;
      type: "notice";
      tone: "info" | "warning" | "error" | "success";
      title: string;
      body?: string;
      actions?: CardAction[];
    };

export type ChatMessageMetadataV1 = {
  protocol: typeof CHAT_PROTOCOL;
  cards: ChatCard[];
  runId?: string;
};
```

安全规则：

- 客户端点击只回传 `messageId + cardId + actionId + values`。
- 客户端不得信任卡片中自带的 API 地址、contentId 或 jobId 去执行任意请求。
- 服务端必须从当前用户拥有的原消息中解析真实动作与实体。
- 卡片不能携带 API Key、Cookie、SQL、Prisma 参数、Worker action、JavaScript 或 HTML。
- Markdown 渲染禁用原始 HTML，清理危险链接协议。

## 7. Agent 与 Skill 架构

### 7.1 首批 Agent 命令白名单

```ts
export type AgentCommand =
  | "reference.import"
  | "reference.extract_idea"
  | "reference.generate_original"
  | "reference.add_to_style_profile"
  | "content.create"
  | "content.generate"
  | "content.propose_patch"
  | "content.apply_patch"
  | "content.score"
  | "content.save_revision"
  | "content.restore_revision"
  | "job.retry"
  | "job.cancel"
  | "connection.open"
  | "publish.prepare";
```

Agent 决策可以由 LLM 生成，但必须经过 Zod 和服务端白名单；LLM 无权自由构造 URL、SQL、供应商请求或发布动作。

### 7.2 Skill 稳定接口

第一阶段只实现代码内置 Skill Registry：

```ts
export type SkillCapability =
  | "conversation.read_current"
  | "reference.read_selected"
  | "idea.read"
  | "content.read"
  | "content.propose_revision"
  | "job.request";

export type SkillManifestV1 = {
  protocol: "star-skill/v1";
  id: string;
  version: string;
  name: string;
  description: string;
  triggers: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredCapabilities: SkillCapability[];
  requiredCredentials?: string[];
  execution: { type: "builtin" } | { type: "remote"; endpoint: string };
};

export type SkillExecutionResultV1 = {
  status: "completed" | "waiting_input" | "failed";
  text?: string;
  cardDrafts?: Array<Record<string, unknown>>;
  proposedEffects?: Array<
    | { type: "content.propose_revision"; payload: unknown }
    | { type: "job.request"; action: string; input: unknown }
  >;
};
```

Skill 只能提出 effect，由主应用校验并执行，不能直接写 Prisma。

内置 Skill 建议：

- `builtin.reference-import`
- `builtin.reference-to-original`
- `builtin.idea-to-xhs`
- `builtin.idea-to-douyin`
- `builtin.style-analyze`
- `builtin.content-score`
- `builtin.content-revise`

未来远程 Skill 再增加：

- HTTPS + 域名白名单。
- HMAC 签名和短期 callback token。
- 用户级授权范围。
- SSRF 防护、超时、并发和输出大小限制。
- `SkillConnection` 加密配置与 `SkillInvocation` 审计。

Beta 阶段禁止：

- 用户填写任意远程执行 URL。
- 动态安装 npm 包。
- `eval`、`new Function`、浏览器端执行外部脚本。
- 把 TikHub、DeepSeek、AiToEarn 或 Cookie 原文传给 Skill。

## 8. API 方案

保留 `/api/conversations`，新增：

```http
POST /api/conversations/:id/messages
POST /api/conversations/:id/actions
GET  /api/conversations/:id/messages?cursor=...
GET  /api/agent-runs/:id
POST /api/agent-runs/:id/cancel
```

发送消息：

```ts
type SendMessageRequest = {
  clientMessageId: string;
  parts: Array<
    | { type: "text"; text: string }
    | { type: "reference_url"; url: string }
    | { type: "entity"; reference: EntityRef }
  >;
  context?: {
    platform?: "xiaohongshu" | "douyin";
    contentId?: string;
    personaId?: string;
    styleProfileId?: string;
  };
};
```

卡片动作：

```ts
type InvokeCardActionRequest = {
  clientActionId: string;
  sourceMessageId: string;
  cardId: string;
  actionId: string;
  values?: { optionIds?: string[]; text?: string };
};
```

现有 `/api/chat` 暂时保留为兼容适配器，内部转调新服务；创作页完成迁移后标记废弃。现有 `/api/jobs/:id` 继续两秒轮询，不增加 WebSocket。文本流式响应不是第一批阻塞项，先保证持久化和刷新恢复正确。

## 9. 最小数据模型扩展

不要为每张 UI 卡建表。卡片放 `Message.metadata`，新增状态和幂等字段：

```prisma
enum MessageStatus {
  pending
  complete
  failed
}

model Message {
  id              String        @id @default(cuid())
  conversationId  String
  role            MessageRole
  content         String
  metadata        Json?
  protocolVersion Int           @default(1)
  status          MessageStatus @default(complete)
  clientMessageId String?
  createdAt       DateTime      @default(now())
  conversation    Conversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@unique([conversationId, clientMessageId])
  @@index([conversationId, createdAt])
}
```

建议新增 `AgentRun`，用于把一条用户请求、占位消息和多个任务串起来；`ProcessingJob` 增加 `action`、`agentRunId`、`parentJobId`，以便刷新后恢复真实任务语义。

新增 `ContentReference`，把正式内容与参考证据绑定：

```prisma
enum ContentReferenceRole {
  inspiration
  facts
  structure
  style
}

model ContentReference {
  id                 String               @id @default(cuid())
  userId             String
  contentId          String
  benchmarkAccountId String?
  benchmarkNoteId    String?
  ideaId             String?
  role               ContentReferenceRole @default(inspiration)
  sourceUrl          String?
  fingerprint        String
  snapshot           Json
  createdAt          DateTime             @default(now())

  @@unique([contentId, fingerprint, role])
  @@index([userId, contentId])
}
```

`snapshot` 只存生成时允许使用的摘要、结构、证据和校验和，不保存供应商完整原始响应。

`ContentRevision` 增加：

```prisma
originJobId String? @unique
provenance  Json?
```

`originJobId` 防止 Worker 重试创建重复版本。

## 10. 视觉与组件规范

> 当前前端设计唯一基线为根目录 `DESIGN.md`。本节保留产品交互背景；色彩、排版、间距、组件状态、响应式和验收细则均以 `DESIGN.md` 为准。任何前端批次开始前必须先完整阅读该文件。

### 10.1 色彩

- 主内容：`#FFFFFF`
- 页面底色：`#FAF9F6`
- 会话栏：`#F5F4F1`
- 主文字：`#171717`
- 次文字：`#6B6B66`
- 分隔线：`#E7E5E0`
- 品牌红：`#C83B32`，只用于主动作、当前状态和风险
- 成功：克制绿色；等待：琥珀色；失败：红色

不要把品牌红铺满用户消息，不使用 AI 紫色、渐变、玻璃拟态、霓虹、发光边框或深色赛博背景。

### 10.2 排版和空间

- Noto Sans SC 继续作为主字体。
- IBM Plex Mono 只用于时间、版本、分数和技术标识。
- 对话正文 `15px / 1.7`，最大宽度 `48rem`。
- 页面标题不超过 `24–28px`。
- 普通圆角 `10–12px`，Composer `22–24px`。
- 阴影只用于 Composer、Popover、Dialog 和浮动 Artifact。
- Agent 长回复使用无边框正文；用户消息使用浅暖灰小气泡。

### 10.3 Composer

```text
[选题：AI 面试] [风格：职场观察] [参考：2]
告诉星迹你想创作什么……
[＋ 资料/链接/选题/风格/技能] [小红书⌄] [深度创作⌄]   [发送]
```

- 默认 1–2 行，最多 8 行后内部滚动。
- 生成时发送按钮变为停止。
- 上下文用可删除 Chip。
- 平台选择始终可见，不藏到设置页。
- 支持 `/导入`、`/生成`、`/评分`、`/发布` 作为效率入口，但不强迫用户学习。

### 10.4 Agent 执行卡

默认折叠：

```text
✓ 已完成创作准备 · 42 秒
  研究 3 个热点 · 分析 8 条作品 · 使用 1 个风格画像
```

展开后显示阶段。供应商名、请求 JSON、堆栈和技术日志进入“技术详情”，不直接刷屏。

`waiting_input` 必须显示页面内决策卡；失败卡展示可理解原因、已完成阶段、重试和连接设置入口；不能只 Toast。

### 10.5 Artifact

对话内成果块：

```text
小红书图文初稿                         v3
“裸辞后我才发现，真正耗尽我的不是工作”
8 页 · 812 字 · 评分 82
[打开编辑] [继续优化] [导出] [准备发布]
```

打开后只保留三组主标签：

1. 内容
2. 结构
3. 评分与证据

版本选择、保存状态、导出和准备发布放固定顶栏。

抖音默认只显示时间、口播、画面、字幕；镜头、转场、音乐和风险放进单条分镜“高级项”，不要每镜同时显示九个输入框。

## 11. 文件重构边界

建议目标结构：

```text
app/creator/
  layout.tsx
  xiaohongshu/page.tsx
  douyin/page.tsx

components/creator/
  creator-agent-workspace.tsx
  creator-shell.tsx
  conversation-sidebar.tsx
  conversation-thread.tsx
  creator-composer.tsx
  creator-message.tsx
  cards/
    option-card.tsx
    reference-card.tsx
    agent-run-card.tsx
    artifact-card.tsx
    approval-card.tsx
    notice-card.tsx
  artifact/
    artifact-panel.tsx
    artifact-toolbar.tsx
    score-evidence-panel.tsx
    revision-menu.tsx
    xhs-graphic-editor.tsx
    douyin-storyboard-editor.tsx
  context/
    context-picker.tsx
    project-context-drawer.tsx
    skill-picker.tsx

hooks/creator/
  use-conversation.ts
  use-agent-run.ts
  use-artifact.ts
  use-autosave-revision.ts

lib/creator/
  chat-protocol.ts
  chat-schemas.ts
  action-registry.ts
  agent-service.ts
  reference-brief.ts
  skill-registry.ts
  skill-protocol.ts

app/api/conversations/[id]/
  messages/route.ts
  actions/route.ts

app/api/agent-runs/[id]/
  route.ts
  cancel/route.ts
```

`components/creator-workbench.tsx` 最终应删除或仅保留薄兼容导出，不能继续扩大。

## 12. Claude 执行批次

### C0：保存当前基线，不改功能

目标：确保之后可以判断回退和回归。

任务：

1. 记录 `git status --short`、`git diff --stat` 和当前服务状态。
2. 不重置、覆盖或提交用户改动；如用户明确允许，再创建 WIP checkpoint。
3. 运行 lint、typecheck、unit、contract、integration。
4. 用浏览器保存现状截图：
   - `1440×900` 空创作页。
   - `1440×900` 三栏编辑页。
   - `390×844` 创作页。
5. 写下已知问题：恢复版本旧闭包、生成覆盖人工修改、会话刷新丢失。

验收：没有业务文件变化；基线证据完整。

### C1：协议、幂等和数据模型

目标：先建立会话卡片和 Agent Run 真相源，不先画 UI。

允许修改：

- `prisma/schema.prisma`
- 新迁移
- `lib/creator/chat-protocol.ts`
- `lib/creator/chat-schemas.ts`
- `lib/creator/skill-protocol.ts`
- 对应 unit/integration 测试

任务：

1. 实现 `star-chat/v1` 的 Message/Card/Action Zod schema。
2. Message 增加状态、协议版本、`clientMessageId` 与唯一约束。
3. 新增 `AgentRun`、`ContentReference`。
4. `ProcessingJob` 增加数据库 action、run 和父任务关联。
5. `ContentRevision` 增加 `originJobId` 和 provenance。
6. 迁移旧 Message 为 complete/v1，不改旧内容。
7. 增加重复消息、重复动作、重复 Worker 版本和跨用户测试。

验收：旧数据可读；同一个 clientMessageId 只创建一次；Worker 重试不创建重复版本。

### C2：创作专用壳与会话恢复

目标：先让第一眼像 Agent 助手，仍可暂时使用旧聊天后端。

允许修改：

- `app/creator/layout.tsx`
- `components/creator/creator-shell.tsx`
- `components/creator/conversation-sidebar.tsx`
- `components/creator/conversation-thread.tsx`
- `components/creator/creator-composer.tsx`
- 创作页入口和 Creator 专用样式

任务：

1. 创作路由脱离后台式 `AppShell`，其他页面保持不变。
2. 建立可折叠会话栏、顶部项目栏、居中消息流和底部 Composer。
3. 接入会话列表和历史消息；URL 使用 `conversationId` 恢复。
4. 小红书/抖音共用 `CreatorAgentWorkspace`，平台是上下文而非两套布局。
5. 移除首页项目大表单，首条消息时懒创建会话。
6. 从 `/ideas` 进入时把 Idea 作为 Composer 上下文 Chip，不立刻展示密集表单。

验收：刷新后恢复同一会话；空页第一眼只有会话、Composer 和少量快捷入口；1440 与 390 无横向溢出。

### C3：消息与卡片动作 API

目标：让对话真正可以驱动动作。

允许修改：

- `app/api/conversations/[id]/messages/*`
- `app/api/conversations/[id]/actions/*`
- `app/api/agent-runs/*`
- `lib/creator/action-registry.ts`
- `lib/creator/agent-service.ts`
- `lib/services/conversation-service.ts`
- 新卡片组件和测试

任务：

1. 实现消息、动作、Run API。
2. 创建 pending assistant message，任务结束后更新；刷新不丢状态。
3. 服务端动作注册表只允许白名单命令。
4. 支持 option、notice、progress、approval 卡片。
5. `waiting_input` 进入消息流，不只 Toast。
6. `/api/chat` 变成兼容适配器，旧命令英文提示不得出现在新 UI。
7. 当前先用非流式文本；保证持久化和恢复后再考虑 SSE。

验收：自然语言消息、选择卡和动作卡可持久化、重放、防重复；两个用户不能互点对方卡片。

### C4：链接导入与一键参考生成纵向切片

目标：优先跑通用户明确要求的链接流程。

任务：

1. Composer 自动识别小红书、抖音和普通网页 URL。
2. 复用现有 `/api/references/import` 与 `reference.import` Worker。
3. 导入时显示 ReferenceCard + ProgressCard。
4. 生成并保存脱敏 `ReferenceBrief`。
5. 抖音缺转写时串联 Qwen-ASR。
6. 导入成功显示：参考结构生成原创稿、提炼选题、加入参考集、构建风格、查看证据。
7. 点击生成时创建 `ContentReference`，再复用 `content.generate`。
8. 生成器只读取 ReferenceBrief，不直接读取供应商完整 `rawData`。
9. 普通网页重复导入不得重复创建 Idea。

验收：三个脱敏 fixture（小红书、抖音、网页）端到端通过；重复点击不重复导入或生成；刷新保留进度和动作结果。

### C5：Artifact 成果块与桌面侧栏

目标：生成结果不再把用户推入密集表单。

任务：

1. 实现对话内 ArtifactCard。
2. 点击后桌面打开右侧 Artifact，窄屏/手机全屏。
3. 顶栏显示保存状态、版本、撤销/重做、评分、导出、准备发布。
4. 只保留内容/结构/评分与证据三个主标签。
5. 评分警告能定位到对应内容块。
6. 证据以轻量编号展示，详情在抽屉。
7. 修复恢复版本旧闭包问题；恢复必须由选中 revision payload 直接创建新版本。
8. 生成期间如存在人工修改，完成后不得静默覆盖；显示冲突选择。

验收：对话可继续使用；Artifact 可关；人工编辑、AI 改写和恢复均产生正确版本；冲突测试通过。

### C6：小红书和抖音编辑器渐进披露

目标：保留全部字段，但不一次性露出全部表单。

小红书：

- 按真实阅读顺序编辑：标题、封面、分页、完整正文、结尾、标签。
- 分页默认显示预览和主要正文，视觉提示按需展开。
- 支持选中文本“让星迹修改”。

抖音：

- 默认时间轴只显示时间、口播、画面、字幕。
- 镜头、转场、音乐、风险进入高级项。
- 手机点击单镜进入全屏编辑。
- 时间连续性和总时长做即时校验。

验收：所有原字段仍可编辑/导出；桌面不形成卡片墙；手机不出现宽表或九字段同屏。

### C7：内置 Skill Registry

目标：证明未来接 Skill 不需要改聊天 UI。

任务：

1. 实现 `star-skill/v1` manifest、execution、result Zod schema。
2. 实现 capability 校验和代码内置 registry。
3. 把参考转原创包装为 `builtin.reference-to-original`。
4. Skill 只能返回 cardDrafts/proposedEffects，主应用验证后执行。
5. Composer `+` 菜单增加“技能”，读取 manifest 列表。
6. 做一个禁用的 RemoteSkillAdapter 接口和 fixture，不开放任意 URL。
7. 增加恶意输出、越权实体、提示注入、超时和输出过大测试。

验收：更换内置 Skill 实现不改消息组件；Skill 无法直接写数据库或获得凭证原文。

### C8：发布确认与 Agent 状态统一

目标：发布仍然高安全，但从成果流自然进入。

任务：

1. Artifact 的“准备发布”生成 approval 卡，列出平台、账号、正文版本、素材和时间。
2. 用户明确确认后才调用既有发布 Flow。
3. 导入、ASR、生成、发布、指标使用同一个 RunCard。
4. 抖音 `awaiting_user` 在消息流显示短链和刷新动作。
5. 取消、失败、重试、凭证失效、依赖不可用都有内联状态。

验收：重复确认不重复发布；用户始终知道当前由 Agent、供应商还是自己处理。

### C9：移动端、无障碍与完整 E2E

任务：

1. `390×844` 单栏对话；会话列表 Drawer；Artifact 全屏。
2. Composer 固定底部并处理 safe-area、软键盘和最大高度。
3. 手机创作态不显示会遮挡 Composer 的全局底部导航。
4. `aria-live` 宣布任务状态；焦点进入/退出 Artifact 可恢复。
5. 补充：
   - `creator-agent-flow.spec.ts`
   - `creator-reference-flow.spec.ts`
   - `creator-resume.spec.ts`
   - `creator-mobile.spec.ts`
   - `creator-conflict.spec.ts`
   - `creator-revision.spec.ts`
   - `creator-skill-security.spec.ts`
   - `creator-a11y.spec.ts`
6. 真实浏览器截图固定：
   - 1440×900：空会话、Agent 运行、Artifact 打开。
   - 390×844：对话、选项卡、ReferenceCard、Artifact、waiting_input。

验收：无页面横向溢出；无框架错误层；控制台无相关错误；键盘可完成核心路径；仅“页面标题可见”的冒烟测试不能替代流程测试。

### C10：回到原三个月计划做真实验收

UI 通过用户验收后，再按顺序完成真实外部闭环：

1. Resend 邀请登录两用户演练。
2. TikHub 小红书 20 个受支持样本，成功率 ≥90%。
3. TikHub 抖音 20 个样本 + Qwen-ASR 真实转写，成功率 ≥90%。
4. 风格画像 5–20 条证据、人工确认和生成引用。
5. AiToEarn 两平台授权、浏览器直传、各 5 次连续真实或沙箱发布。
6. D+1/D+3/D+7 真实定时任务与误判规则候选。
7. Linux 部署、HTTPS、备份恢复、来源监控、Lighthouse 和 3–5 名内测。

任何一项没有真实凭证或外部记录，只能标记“代码完成/待实测”，不能通过最终验收。

## 13. 并发、版本和安全门槛

- 消息：`conversationId + clientMessageId` 唯一。
- 卡片动作：`userId + clientActionId` 唯一。
- 动作基础幂等键：`messageId:cardId:actionId`。
- 导入：用户 ID + 规范 URL 指纹；社交作品继续按平台内容 ID upsert。
- 生成：内容 ID + 最新 revision checksum + 参考指纹 + promptVersion。
- Worker 生成版本：`ContentRevision.originJobId` 唯一。
- 对话、消息、Run、Job、内容、参考和 Skill 调用全部验证当前用户。
- 高风险动作（发布、删除、覆盖、外部授权）必须二次确认。
- 外部网页和作品正文视为不可信输入，禁止覆盖系统和 Skill 指令。
- URL 只允许 http/https，限制重定向、正文大小和私网地址。

## 14. 每个批次的停止条件

Claude 必须在以下任一情况停止，而不是自行扩大范围：

- 需要修改当批未授权的模块。
- 发现当前未提交改动与计划冲突。
- 需要真实 API Key、验证码、平台账号或发布确认。
- 数据迁移会丢失现有数据。
- 设计选择会改变路由、产品边界或热点/创作隔离原则。
- 测试失败且根因不在当前批次。

停止时要给出：证据、影响、两个可选方向和推荐方向，不要用假数据绕过。

## 15. 最终验收故事

以下故事全部成立，才算创作主链完成：

1. 用户进入类似 ChatGPT 的单栏对话页，输入需求或粘贴链接。
2. Agent 用少量必要卡片完成平台、方向或参考方式选择。
3. 导入、转写、分析和生成过程可观察、可取消、可恢复。
4. 链接导入完成后，一键按结构生成原创小红书或抖音脚本。
5. 生成结果以 Artifact 出现，正式内容落 `ContentRevision`。
6. 用户在对话中要求局部修改，看到 Diff，确认后创建新版本。
7. 用户手工编辑并自动保存，刷新后恢复同一会话、作品和任务。
8. 发布前评分、证据、版本和导出按需打开，不挤占默认对话。
9. 外接 Skill 可以通过稳定协议返回卡片和 proposed effect，但不能越权写数据。
10. 桌面和手机都没有三栏压缩、横向溢出、输入框遮挡或关键状态只靠 Toast。

一句话定义完成：

> 用户在一个对话式 Agent 工作台里完成选择、导入、等待、生成、改写、版本和发布准备；任何正式内容都有 ContentRevision，任何异步动作都有 ProcessingJob/AgentRun，任何按钮都能追踪到当前用户、原消息和幂等动作。

## 16. 给 Claude 的首批复制提示词

先只执行 C0，不写功能代码：

```text
请完整阅读根目录 CLAUDE.md、CONTEXT.md 和 docs/CLAUDE_CREATOR_AGENT_PLAN.md。
本轮只执行 C0：保存并审计当前基线，不修改任何业务文件。

你必须：
1. 先输出 git status --short 和 git diff --stat 的摘要，确认不覆盖现有未提交改动。
2. 运行计划列出的 lint、typecheck、unit、contract、integration。
3. 用真实浏览器在 1440×900 和 390×844 检查当前小红书/抖音创作页，记录页面级横向溢出、控制台错误和主要交互问题。
4. 特别验证两个已知风险：恢复版本是否保存了错误闭包中的旧 draft；生成完成重新加载是否会覆盖等待期间的人工修改。
5. 给出 C1 开始前的文件边界和风险，不要开始 C1。

禁止 reset、checkout、stash、删除或格式化整个仓库。完成证据报告后停止，等我验收。
```
