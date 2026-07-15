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

## 发布门槛

- `npm run lint`
- `npm run typecheck`
- 单元测试：156/156
- 契约测试：22/22
- 集成测试：85/85
- `npm run build`
- 生产依赖审计：0 个漏洞（官方 npm registry）
- 服务器 `npm run preflight:prod`：切流前必须 11/11 通过。

## DNS 与邮件

- 切换前：Cloudflare `creat-mcn.wlwl-tools.com` A 记录指向 `65.49.231.53`。
- 切换后：A 记录指向 `12.22.163.133`，保持代理开启和 TTL 自动。
- Resend 发件域：`mail.wlwl-tools.com`。
- 发件人：`星迹内容助手 <noreply@mail.wlwl-tools.com>`。
- Resend API Key 只保存于生产环境文件，不进入 Git、日志或本清单。

## 回滚与已知限制

- DNS 回滚：恢复 A 记录到 `65.49.231.53`。
- 应用回滚：将 `/opt/min-xingji/production` 指回上一发布目录并重启生产 Web/Worker；数据库迁移不自动回滚。
- 问卷站、原 MCN、日程站、静态站和 Xray 443 不属于本次变更范围。
- muxqiao 的 Grok-4.5 当前返回上游 HTTP 503，不得标记为可用。
- AiToEarn、TikHub、DashScope 和真实内容生成必须由登录用户配置有效凭证后单独验收。
