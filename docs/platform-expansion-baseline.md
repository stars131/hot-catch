# C14 平台扩展基线

更新时间：2026-07-16

## 当前平台与能力边界

平台统一由 `lib/platforms/registry.ts` 注册，服务端生成 Schema、提示词、格式检查、Markdown 转换和素材清单位于 `lib/platforms/server-registry.ts`。客户端只消费轻量元数据和当前编辑器，不携带服务端提示词。

| 平台 | 内容类型 | 创作 | 公开链接参考 | 发布 | 指标 |
|---|---|---|---|---|---|
| 小红书 | `xhs_graphic` | 支持 | 供应商连接 | AiToEarn | 供应商连接 |
| 抖音 | `douyin_video_script` | 支持 | 供应商连接 | AiToEarn | 供应商连接 |
| YouTube | `youtube_video_package` | 支持 | 安全抓取/Firecrawl | 仅导出 | 不支持 |
| TikTok | `tiktok_short_video_script` | 支持 | 安全抓取/Firecrawl | 仅导出 | 不支持 |
| Instagram | `instagram_carousel` | 支持 | 安全抓取/Firecrawl | 仅导出 | 不支持 |
| X | `x_thread` | 支持 | 安全抓取/Firecrawl | 仅导出 | 不支持 |
| Reddit | `reddit_post` | 支持 | 安全抓取/Firecrawl | 仅导出 | 不支持 |

国外平台不创建 OAuth、发布记录或指标快照。真实发布接口在写入任何记录前返回 `PUBLISHING_NOT_SUPPORTED`。公开链接抓取经过 SSRF 校验；受阻时要求用户粘贴有权使用的摘要，不生成替代内容。参考资料只服务于当前用户本次推理，保留来源和删除入口，不进入训练集或跨用户资料库。

## 数据与协议

- `Conversation.targetPlatforms` 与 `targetLocale` 保存创作包默认设置。
- 每个平台独立创建一个 `GeneratedContent`、一个生成 Job 和一个可重试项；`GeneratedContent.contentLocale` 记录内容语言。
- 旧单值 `platform` 与旧小红书/抖音 URL 保持兼容；主入口为 `/creator`。
- `POST /api/conversations/[id]/generation-batches` 最多接受五个平台、一个目标语言与八个 Skill，并在服务端重新验证登录、归属、平台注册和 Skill 权限。
- `GET /api/agent-runs/[id]/export` 输出 `startrace-export/v1` UTF-8 ZIP。包内不包含凭证、供应商原始响应、自定义 Skill 完整指令或虚构媒体。
- API 错误保留稳定 `code` 与 `messageKey`；Worker 在数据库保留诊断信息，面向用户和导出包只返回本地化安全提示。

## 多语言边界

- 界面语言：`zh-CN`、`en-US`；内容语言另行选择，二者互不影响。
- 内容语言：`zh-CN`、`en-US`、`ja-JP`、`ko-KR`、`es-ES`、`fr-FR`、`de-DE`、`pt-BR`。
- 界面语言解析顺序：一年有效的 `STARTRACE_UI_LOCALE` Cookie → `Accept-Language` → `zh-CN`。
- 不使用语言 URL 前缀。切换只刷新 Server Components，保留路径、查询参数、会话和客户端草稿状态，同时更新 `<html lang>` 与 Metadata。
- 登录邮件固定使用中英双语模板；品牌名、用户内容和引用原文不强制翻译。

## C14A / C14B 发布顺序

1. 发布前执行 PostgreSQL custom-format 备份并完成临时库恢复校验。
2. C14A 部署迁移 `202607160001_c14_global_platforms`、新 Prisma Client、注册表与兼容字段，设置 `FOREIGN_PLATFORM_CREATION_ENABLED=0`。Web 与 Worker 必须使用同一提交生成的 Prisma Client；不得只更新 Web。
3. 验证旧小红书/抖音、邀请登录、Worker、数据库、Redis、既有站点和 ZIP UTF-8 解析。
4. C14B 将 `FOREIGN_PLATFORM_CREATION_ENABLED=1`、`UI_I18N_ENABLED=1`，重新运行生产预检并重启 Web/Worker。
5. 验收中英文切换、五平台日语批次、多 Skill、单项重试、编辑、ZIP 与国外平台发布拦截。

回滚目标是已理解新枚举但关闭功能的 C14A。数据库迁移保持向前兼容，不自动回滚到 C13；若 C14B 验收失败，关闭两个功能开关并将应用软链接切回 C14A。

## 后续真实平台接入

真实 OAuth、发布和指标同步继续按平台独立设计。每个适配器必须分别声明凭证要求、授权范围、内容/素材约束、审核限制、费用与商业条款、幂等策略、失败码、指标字段和数据保留规则。未完成真实凭证与沙盒/生产验收前，能力状态不得从“仅导出”改为“可发布”。
