# Claude Code D1 — 单平台项目基础

你正在修改 `D:\make\min-xingji`。

开始前完整阅读：

- `AGENTS.md`
- `CLAUDE.md`
- `CONTEXT.md`
- `DESIGN.md`
- `docs/CLAUDE_CREATOR_AGENT_PLAN.md`
- `docs/platform-expansion-baseline.md`

## 用户目标

把现有多平台创作系统逐步迁移为：

- 一个 `PlatformProject` 固定一个平台；
- 登录、素材、热点、AI、任务队列等基础能力继续共享；
- 跨平台通过显式 `ProjectTransfer` 产生目标项目或目标内容，并永久保留来源链路；
- 第一条完整适配链路是抖音，后续增加 OAuth、创作者中心会话与深度作品指标。

## 当前批次

本次只完成 D1 后端基础，不做页面，不接真实抖音接口，不迁移现有创作流程。

实现以下内容：

1. 在 `prisma/schema.prisma` 中以加法方式增加单平台项目模型。
   - `PlatformProject` 必须属于一个 `userId` 和一个 `Platform`。
   - 支持名称、状态、可选默认 `SocialConnection`、设置、归档时间。
   - `Conversation` 与 `GeneratedContent` 增加可空 `platformProjectId`，为后续双写保留兼容性。
   - 增加 `ProjectTransfer`，保存来源项目、目标项目、类型、状态、源快照、转换配置、结果、错误和时间。
   - 所有查询需要可按 `userId` 建索引。
   - 不删除或收紧现有 `targetPlatforms`、`platform` 等旧字段。

2. 创建加法式 SQL migration。
   - 禁止重置数据库。
   - 禁止回滚或修改旧 migration。
   - 新外键初始必须允许旧数据继续存在。

3. 增加平台项目服务与校验器。
   - 创建、列出、读取、更新、归档项目。
   - 创建转发记录。
   - 强制校验项目属于当前用户。
   - 默认账号必须属于当前用户且平台与项目一致。
   - 转发的来源与目标都必须属于当前用户。
   - 不转发账号凭证、Cookie、发布记录或历史指标。
   - 使用现有 `AppError`、Prisma、Zod 和 API 响应约定。

4. 增加 API：
   - `GET/POST /api/platform-projects`
   - `GET/PATCH /api/platform-projects/[id]`
   - `POST /api/platform-projects/[id]/transfers`

5. 增加单元测试和集成测试：
   - userId 隔离；
   - 单项目单平台；
   - 默认账号平台匹配；
   - 跨用户访问失败；
   - 转发只保存允许的快照与配置；
   - 幂等或重复提交行为需要有明确结果。

## 工作区保护

当前工作区已有用户未提交修改。禁止覆盖、格式化、重置、暂存或提交这些文件：

- `AGENTS.md`
- `CLAUDE.md`
- `CONTEXT.md`
- `DESIGN.md`
- `app/creator/layout.tsx`
- `app/globals.css`
- `app/hotspots/page.tsx`
- `app/ideas/page.tsx`
- `app/signin/page.tsx`
- `components/app-shell.tsx`
- `components/creator/**`
- `components/hotspots/x-discovery-panel.tsx`
- `components/workspace-chrome.tsx`
- `docs/CLAUDE_CREATOR_AGENT_PLAN.md`
- `package.json`
- `package-lock.json`
- `tailwind.config.ts`
- 现有 E2E 文件和未跟踪 UI 资产

如果实现需要修改上述文件，停下来并在最终报告列出原因，不要直接修改。

## 数据真实性边界

- 创作者中心真实接口尚未完成登录探测。
- 禁止虚构 URL、endpoint、请求参数、响应字段、HAR 或成功 fixture。
- D1 只建立平台无关项目基础。
- 缺失的真实平台能力以后使用 `waiting_input`、`permission_required` 或 `unsupported`，不得用模拟成功掩盖。

## 执行要求

- 禁止 `git reset`、`git checkout --`、`git clean`。
- 禁止执行 git commit、push、PR。
- 只修改本批次明确需要的文件。
- 运行 Prisma 格式检查、类型检查以及相关测试。
- 若测试受现有未提交修改影响，区分本批次失败和既有失败。
- 最终用中文报告：修改文件、模型/API、测试结果、未完成项和风险。
