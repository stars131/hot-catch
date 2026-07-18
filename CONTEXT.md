# 星迹内容助手实施上下文

## 产品边界

本期只支持小红书图文和抖音视频脚本/发布。热点研究与创作工作区保持隔离：热点只能收藏到选题库，创作从 `/creator/*` 发起。快手、视频号、自动成片、评论互动和矩阵批量生产不在本期。

创作体验采用 Chat-first Agent 工作台：实际创作、卡片选择、参考链接导入、生成和改写从对话发起，正式内容通过可版本化 Artifact 编辑。需保留受控外接 Skill 协议，以及公开或授权链接导入后一键按结构生成原创内容的能力。详细执行边界见 `docs/CLAUDE_CREATOR_AGENT_PLAN.md`。

## 已确认基线

- 保留 Next.js 15、React 18、Prisma、PostgreSQL 与 Tailwind 3。
- 保留现有 `/api/hotspots`、Cookie 来源、本地兜底与账号归一化逻辑。
- 当前工作区存在用户未提交改动；禁止重置、覆盖或删除这些改动。
- 开发环境可使用明确开启的本地身份旁路；生产环境必须通过邀请制邮件登录。
- 生产环境不得用 mock 数据掩盖数据库、Redis、AI 或供应商故障。

## 实施规则

1. 所有供应商响应先进入适配器，再转换为稳定领域类型。
2. 所有异步动作同时写 PostgreSQL 状态，并在 BullMQ 执行。
3. 所有新业务查询必须带当前 `userId`，并通过跨用户测试。
4. 凭证只以 AES-256-GCM 密文落库，接口只返回状态和尾号提示。
5. 发布创建使用本地幂等键；超时先查供应商记录，不盲目重发。
6. 媒体仅在 Worker 临时目录处理，成功或失败后都清理。

## 本地启动

复制 `.env.example` 为 `.env`，然后执行：

```bash
npm run dev:docker
```

健康检查地址：`http://localhost:3000/api/health`。

已有开发数据库首次升级使用 `prisma db push` 保留原表数据，然后执行 `npm run db:backfill`，把旧 `xhsId`/`noteId` 回填到通用平台字段。全新生产数据库使用 `prisma migrate deploy`。
