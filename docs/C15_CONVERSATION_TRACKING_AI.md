# C15：对话式创作、热点 AI 与历史内容复盘

## 发布范围

- 工作区导航提升到根布局，页面切换时侧栏保持挂载，并对常用入口执行预取。
- 选题和创作统一使用对话流程；平台、语言、Skill 和候选选题由服务端签名卡片驱动。
- 热点研究增加按用户模型凭证执行的 AI 分类、筛选、风险和创作角度建议，原始热度与来源证据保持不变。
- 数据复盘支持导入历史帖子、视频和文章链接，记录平台同步、手工指标和 AI 复盘结果。
- 国外平台 Artifact 使用通用结构编辑器；国外平台仍只支持导出后手动发布。

## 用户隔离

- 模型、热点源、TikHub、YouTube Data API 和其他连接凭证均按登录用户保存。
- 生产环境不读取共享热点 Cookie；`ALLOW_SHARED_HOTSPOT_CREDENTIALS` 只允许在非生产环境显式启用。
- 跟踪对象、指标快照、AI 分析与热点 AI 缓存全部带 `userId`，API 重新校验归属。
- 用户未配置可用模型时返回明确错误，不回退到共享模型，也不生成 mock 结果。

## 历史链接能力矩阵

| 来源 | 首版同步方式 | 没有连接时 |
|---|---|---|
| 小红书、抖音 | 用户自己的 TikHub 凭证 | 保留链接并提示配置连接或手工录入 |
| YouTube | 用户自己的 YouTube Data API Key | 保留链接并提示配置连接或手工录入 |
| TikTok、Instagram、X、Reddit | 后续 OAuth/官方适配器 | 保留链接并允许手工指标 |
| 普通网页文章 | 安全公开页摘要 | 允许手工指标与有限 AI 复盘 |

## 数据库和接口

- 迁移：`20260716162055_c15_hotspot_tracking`
- 新表：`HotspotAiInsight`、`SocialConnection`、`TrackedPublication`、`TrackedMetricSnapshot`、`TrackingAnalysis`
- 新凭证类型：`youtube_data`
- 新接口：`POST /api/hotspots/analyze`、`/api/tracking` 及其刷新、指标和分析子路由。
- Worker 增加 `tracking.sync` 任务；同步任务按跟踪对象和时间桶幂等。

## 发布与回滚

1. 发布前执行 PostgreSQL custom-format 备份并恢复到临时数据库验证。
2. 部署新发布目录，执行 `prisma migrate deploy`、生产预检和构建。
3. 原子切换 `/opt/min-xingji/production`，只重启生产 Web 与 Worker。
4. 若应用验收失败，将软链接切回 C14 并重启生产服务；数据库迁移保持不回滚，新表和枚举对 C14 向前兼容。

## 模型测试备注

兼容 OpenAI Chat Completions 的测试配置可以使用：

- Base URL：`https://api.fengwind.com/v1`
- Endpoint：`/chat/completions`
- Model：`grok-4.5`

API Key 必须由对应服务单独签发，只保存到用户自己的连接设置中，不进入仓库或发布文档。
