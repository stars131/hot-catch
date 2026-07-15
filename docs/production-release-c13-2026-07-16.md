# C13 生产发布清单

更新时间：2026-07-16

## 代码基线

- 分支：`codex/c13-production-release`
- 功能提交：`05fef8d78a8a25388d0f34dbee01bafa69df5501`
- 范围：ChatGPT/OpenAI 与 Grok 模型连接、OpenAI-compatible 适配层、Skill 设置入口、单次创作多 Skill 选择、生产预检和平台扩展基线。
- 数据库迁移：`202607110001_beta_foundation`、`202607110002_c1_agent_protocol`、`202607140001_add_llm_provider_settings`、`202607140002_add_skill_settings`。

## 生产拓扑

- 域名：`https://creat-mcn.wlwl-tools.com`
- 主机：`12.22.163.133`
- Web：`min-xingji-prod.service`，监听 `127.0.0.1:3040`
- Worker：`min-xingji-worker-prod.service`，使用独立 Redis DB。
- 当前发布：`/opt/min-xingji/releases/20260715-235645-prod/app`
- 当前软链接：`/opt/min-xingji/production`
- Nginx：`/etc/nginx/sites-available/min-xingji-production`
- 环境：`/etc/min-xingji/production.env`，必须保持 `root:minxingji 0640`。
- 预览环境继续使用 `127.0.0.1:3030`，不参与公网流量。
- 发布目录权限：`0750 minxingji:minxingji`；已确认不存在组/其他用户可写的普通文件或目录（符号链接除外）。

## 状态快照与数据库保护

- root-only 生产快照：`/root/ai-ops/backups/min-xingji-release-baseline-20260715T164755Z`
- 快照内容：生产环境文件、生产 Web/Worker systemd 单元、Nginx 站点配置、完整 Nginx 配置输出、服务状态和监听端口。
- PostgreSQL custom-format 备份：`/root/ai-ops/backups/postgres/min_xingji-20260715T164756Z.dump`
- 校验和：同目录 `.sha256` 文件；备份及校验和权限均为 `0600 root:root`。
- 恢复演练：已恢复到一次性临时数据库并验证 31 张 public 表、4 条已完成迁移和 1 个用户；临时数据库已删除，无残留。
- 每日备份：`min-xingji-backup.timer` 已启用，每日 03:15 触发并带最多 15 分钟随机延迟；保留最近 7 天。
- 备份程序：`/usr/local/sbin/min-xingji-backup`；systemd 单元为 `min-xingji-backup.service` 与 `min-xingji-backup.timer`。

## 发布门槛

- `npm run lint`
- `npm run typecheck`
- 单元测试：156/156
- 契约测试：22/22
- 集成测试：85/85
- `npm run build`
- 生产依赖审计：0 个漏洞（官方 npm registry）
- 服务器 `npm run preflight:prod`：11/11 已通过。

## DNS 与邮件

- 切换前：Cloudflare `creat-mcn.wlwl-tools.com` A 记录指向 `65.49.231.53`。
- 切换后：A 记录指向 `12.22.163.133`，保持代理开启和 TTL 自动。
- Resend 发件域：`mail.wlwl-tools.com`。
- 邮件 DNS：已添加 DKIM TXT、SPF TXT 和发送用 MX，均为“仅 DNS”；未修改根域现有邮件记录，也未添加可选的根域 DMARC。
- Resend 状态：域名已验证；`min-xingji-production` 已按“Sending access + 仅限 mail.wlwl-tools.com”创建。
- 发件人：`星迹内容助手 <noreply@mail.wlwl-tools.com>`。
- Resend API Key 只保存于生产环境文件，不进入 Git、日志或本清单；生产环境已配置。
- 管理员邀请：`2952932090@qq.com` 已续期至 2026-08-14，当前为 `pending`。

## 切流与回滚演练

- 已将 Cloudflare A 记录从 `65.49.231.53` 切到 `12.22.163.133`，公网检测返回 Cloudflare 522 后立即恢复旧源站；旧站健康检查恢复正常。
- 服务器 Nginx 正在 `0.0.0.0:80` 监听，主机内不存在 UFW、nftables 或 iptables INPUT 拦截；外部访问 `12.22.163.133:80` 超时，且失败时 Nginx 没有收到请求，阻断点位于云平台安全组或上游网络。
- 443 继续由 Xray 监听，未修改其配置。
- 已增加仅匹配 `creat-mcn.wlwl-tools.com` 的 Cloudflare Origin Rule `creat-mcn-origin-port-80`，将该子域回源端口改写为 80；不影响其他域名。
- 在上游放通 80 或改用 Cloudflare Tunnel 前，公网 A 记录必须保持 `65.49.231.53`。

## 回滚与已知限制

- DNS 回滚：恢复 A 记录到 `65.49.231.53`。
- 应用回滚：将 `/opt/min-xingji/production` 指回上一发布目录并重启生产 Web/Worker；数据库迁移不自动回滚。
- 问卷站、原 MCN、日程站、静态站和 Xray 443 不属于本次变更范围。
- muxqiao 的 Grok-4.5 当前返回上游 HTTP 503，不得标记为可用。
- AiToEarn、TikHub、DashScope 和真实内容生成必须由登录用户配置有效凭证后单独验收。
