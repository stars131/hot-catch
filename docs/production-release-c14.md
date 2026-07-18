# C14A / C14B 生产发布清单

更新时间：2026-07-16

## 发布物

- 分支：`codex/c14-global-platforms-i18n`
- 数据库迁移：`202607160001_c14_global_platforms`
- 新增环境变量：`FOREIGN_PLATFORM_CREATION_ENABLED`、`UI_I18N_ENABLED`
- 主入口：`/creator`；旧 `/creator/xiaohongshu`、`/creator/douyin` 继续可用。
- 公网链路保持：Cloudflare → `65.49.231.53` 中转 → `12.22.163.133` → Nginx → 生产 Web。不得把 A 记录改为直连 12 开头地址。

Git SHA、构建时间、发布目录、备份文件和服务器预检结果在实际部署时追加；敏感值不得写入本文或 Git。

## C14A

1. 记录当前 `/opt/min-xingji/production` 指向、systemd 重启次数、Nginx/数据库/Redis健康状态。
2. 执行 custom-format 数据库备份、SHA-256 校验与一次性临时库恢复校验。
3. 部署代码并执行 `npx prisma migrate deploy`、`npx prisma generate`、构建与回归测试。
4. 保持 `FOREIGN_PLATFORM_CREATION_ENABLED=0`；`UI_I18N_ENABLED` 可先设为 `0`。
5. 同时重启生产 Web 与 Worker，确认二者使用同一发布目录和同一版 Prisma Client。
6. 验证旧平台创作、发布边界、登录邮件、预览环境和既有站点无回归。

## C14B

1. 在生产环境文件中设置 `FOREIGN_PLATFORM_CREATION_ENABLED=1`、`UI_I18N_ENABLED=1`，保持 `root:minxingji 0640`。
2. 运行 `npm run preflight:prod`，两个 C14 开关必须为通过而非告警。
3. 重启生产 Web/Worker；验证 `/api/health`、数据库、独立 Redis DB、Nginx 与公网中转链路。
4. 验收中文/英文状态保持、五平台单语言批次、多个 Skill、独立重试、编辑与 UTF-8 ZIP。
5. 使用无效或缺失模型凭证确认任务明确失败/等待输入，不创建假内容；调用国外平台发布接口确认无 PublishRecord 或 MetricSnapshot。

## 回滚

- C14B 功能失败：两个开关改回 `0`，软链接切回 C14A，重启 Web/Worker。
- 不回滚数据库枚举，不回到 C13。
- 数据恢复仅在确认数据损坏后使用已校验备份；普通应用失败不得恢复数据库。
- 不修改 `wenjuan.wlwl-tools.com`、其他 Nginx 站点或 Xray 443。
