# 星迹内容助手内测就绪手册（C12）

> 更新：2026-07-12（C12 加固批次）
> 适用对象：准备发起内测的运营者与开发者。
> 诚实边界：本手册明确区分「本地 mock 验证已通过」与「必须真实凭证/真实服务器才能验收」。凡未真实演练的项目一律标记为未验收，禁止用演示数据掩盖。

## 1. 本地启动命令（开发/内测演示）

前提：Node ≥ 18.18、Docker Desktop（含 Compose v2）。首次使用先复制环境文件：

```bash
cp .env.example .env
# 生成凭证加密密钥（必填，否则无法保存任何供应商凭证）
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# 把输出填入 .env 的 CREDENTIAL_ENCRYPTION_KEY
```

### 方式 A：全容器（推荐给非开发者）

```bash
npm run dev:docker        # db + redis + web + worker 一起启动
```

### 方式 B：容器只跑依赖，本机跑 web/worker（推荐给开发者）

```bash
# 1. PostgreSQL + Redis
npm run db:up             # 等价 docker compose up -d db redis

# 2. 首次或 schema 变更后同步数据库（开发库用 db push，不要 migrate dev）
npx prisma db push && npm run db:backfill

# 3. Web（next dev 自动读取 .env）
npm run dev               # http://localhost:3000

# 4. Worker（独立终端；tsx 不读取 .env，必须显式传连接串）
DATABASE_URL="postgresql://xhs:xhs_password@127.0.0.1:5432/xhs_benchmark?schema=public" \
REDIS_URL="redis://127.0.0.1:6379" \
npm run worker
```

健康检查：`curl http://localhost:3000/api/health`，PostgreSQL 与 Redis 均可用时返回 200 `{"status":"ready"}`，任一依赖故障时返回 503 `degraded` 并指明具体依赖——不会伪装成功。

本机有 Clash 类代理时，所有本地请求/E2E 必须加 `NO_PROXY='127.0.0.1,localhost'`，否则健康检查会被代理挂住假超时（详见 `docs/OPERATIONS.md` 的 E2E 一节）。

## 2. 环境变量清单：哪些是 mock/dev，哪些需要真实值

### 2.1 基础设施（本地演示必填）

| 变量 | 本地开发值 | 生产要求 |
|---|---|---|
| `DATABASE_URL` | `.env.example` 默认即可 | 指向生产 Postgres，强密码 |
| `REDIS_URL` | 默认 `redis://127.0.0.1:6379` | 生产 Redis 带 `requirepass` |
| `AUTH_SECRET` | 任意随机串 | `openssl rand -base64 32` 独立生成 |
| `CREDENTIAL_ENCRYPTION_KEY` | 本地生成的 base64 32 字节 | 独立生成，绝不与 AUTH_SECRET 复用；轮换需迁移方案 |
| `DEV_AUTH_BYPASS` | `1`（本地免登录） | 生产强制 `0`（代码层 `NODE_ENV=production` 时旁路自动失效） |

### 2.2 供应商开关：mock 与 real 的边界

| 变量 | 默认 | 说明 |
|---|---|---|
| `PUBLISH_PROVIDER_MODE` | 开发/测试默认 `mock`；**生产环境代码强制 `real`**（`lib/env.ts:60`） | mock = 本地发布状态机 + 契约夹具，绝不调用真实 AiToEarn，且刻意不产生 `published` 终态；real 需要用户级 AiToEarn 凭证 |
| `XHS_FETCH_PROVIDER` | 开发默认 `mock` | `mock` / `third_party` / `public_page`；生产 compose 固定 `public_page` |
| `AUTH_RESEND_KEY` | 空（本地用 DEV_AUTH_BYPASS 绕过邮件） | 生产必填，否则邀请邮件无法发送 |
| `DEEPSEEK_API_KEY` | 空（环境级兜底，可选） | 正式内测由每位用户在「连接设置」中保存自己的 Key（AES-256-GCM 落库） |

其余 `*_BASE_URL`（TikHub/DashScope/AiToEarn/Firecrawl/DeepSeek）默认指向官方地址，无需修改；`PROVIDER_TIMEOUT_MS`、`WORKER_CONCURRENCY`、`MEDIA_DOWNLOAD_MAX_MB` 有安全默认值。

### 2.3 热点 Cookie（与创作凭证隔离）

- 开发环境：热点源 Cookie 可写入 `.hotspot-cookies.local.json`。该文件**仅限本地**：已列入 `.gitignore` 与 `.dockerignore`；代码在 `NODE_ENV=production` 读取时直接返回空、写入时抛错（`lib/hotspots/cookie-store.ts:42,76`）。
- 生产环境：热点 Cookie 走用户级加密凭证（`xiaohongshu_cookie` Provider），接口只返回 `cookieConfigured` 布尔值，永不回传 Cookie 原文。

## 3. 供应商凭证就绪检查表（真实内测前逐项打勾）

所有凭证均由**每位用户**在 `/settings/connections` 自助保存，AES-256-GCM 密文落库，接口只返回状态 + 尾号提示。环境变量里不放用户级 Key。

| # | 供应商 | 用途 | 就绪动作 | 验收标准（当前状态） |
|---|---|---|---|---|
| 1 | Resend（运营者） | 邀请制魔法链接登录 | 生产 env 填 `AUTH_RESEND_KEY` + 发件域名验证；`invite:create` 创建邀请 | ❌ 未演练：需两名真实用户完成登录 |
| 2 | TikHub（每用户） | 小红书/抖音对标作品抓取 | 用户保存 API Key → 状态显示 active | ❌ 未验收：需小红书/抖音各 20 样本 ≥90% 成功率 |
| 3 | Qwen-ASR / DashScope（每用户） | 抖音视频真实转写 | 用户保存 DashScope Key（可选 `DASHSCOPE_WORKSPACE_ID`） | ❌ 未验收：仅契约夹具通过，需真实音频转写演练 |
| 4 | DeepSeek（每用户） | 生成/改写/评分 | 用户保存 API Key | ❌ 未验收：仅 mock 生成链路通过 |
| 5 | AiToEarn（每用户） | 两平台授权与真实发布 | 用户完成 AiToEarn 授权流（`/api/integrations/aitoearn/auth`）→ 账号列表可见 | ❌ 未验收：需真实授权 + 每平台连续 5 次真实/沙箱发布 |
| 6 | Firecrawl（每用户，可选） | 普通网页导入兜底 | 用户保存 Key；无 Key 时网页导入按显式失败处理 | ⭕ 可选项 |

任何一项未打勾，对应链路只能以 mock 模式演示，最终验收报告必须如实标注。

## 4. Postgres 备份与恢复（7 天保留）

生产 compose 已内置 `backup` 服务：每 24 小时执行 `deploy/backup-postgres.sh`，生成 custom-format dump 到 `deploy/backups/`，并自动删除 7 天前的文件（`find -mtime +6 -delete`）。

手动立即备份（生产主机上）：

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml exec db \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner' \
  > "backup-manual-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

本地开发库同理（容器名 `xhs-benchmark-db`）：

```bash
docker exec xhs-benchmark-db pg_dump -U xhs -d xhs_benchmark --format=custom --no-owner > dev-backup.dump
```

恢复流程（会覆盖数据库，先停 web/worker）见 `docs/OPERATIONS.md`「备份与恢复」一节，命令已演练格式但**尚未在真实生产主机执行过恢复演练**——上线前必须完成一次真机演练并记录用时。

## 5. CI 质量门（顺序即本地验收顺序）

`.github/workflows/ci.yml` 与本地验收保持同一顺序：

```text
npm ci → prisma generate → prisma db push（CI 一次性测试库）→ db:backfill
→ lint(--max-warnings=0) → typecheck → test:unit → test:contract → test:integration
→ build → playwright(chromium) test:e2e
```

CI 边界承诺：

- CI 只连 GitHub Actions 内的临时 Postgres/Redis 服务容器，`PUBLISH_PROVIDER_MODE` 走默认 mock，**不配置也绝不调用任何真实付费供应商**（TikHub/DeepSeek/DashScope/AiToEarn/Resend 的 Key 均不存在于 CI）。
- e2e 依赖 `DEV_AUTH_BYPASS=1` 的开发旁路，仅在 CI/本地测试使用；生产代码路径强制失效。
- 失败时上传 `test-results/` 工件（保留 7 天）便于排查。

## 6. 安全基线与跨用户隔离测试索引

### 6.1 凭证与日志卫生

- 凭证只以 AES-256-GCM 密文落库；读取接口只返回 `provider/configured/status/keyHint(尾号)/时间戳`（`lib/services/credential-service.ts`、`lib/security/credentials.ts`）。
- 响应脱敏由测试锁定：`tests/integration/aitoearn-connection.test.ts`（序列化响应不含 secret）、`tests/integration/publish-execution.test.ts`（不含 key/apikey/encryptedPayload）、`tests/integration/user-isolation.test.ts`（热点 Cookie 不出现在凭证摘要）。
- `lib/`、`worker/`、`app/` 全目录无 `console.*` 调用，无第三方 logger——不存在凭证进日志的调用点；契约夹具全部脱敏。

### 6.2 跨用户隔离覆盖索引（资源 → 测试）

| 资源 | 测试位置 |
|---|---|
| 对标账号 | `tests/integration/user-isolation.test.ts` |
| 供应商凭证（含解密拒绝） | `tests/integration/user-isolation.test.ts` |
| 选题 Idea（列表/更新劫持） | `tests/integration/user-isolation.test.ts`（C12 新增） |
| 人设 Persona（upsert id 劫持/回退） | `tests/integration/user-isolation.test.ts`（C12 新增，含 C12 修复的越权更新回归） |
| 风格画像（读/改） | `tests/integration/user-isolation.test.ts`（C12 新增） |
| 评分规则（激活劫持） | `tests/integration/user-isolation.test.ts`（C12 新增） |
| 热点用户 Cookie 存储 | `tests/integration/user-isolation.test.ts`（C12 新增） |
| 内容项目/版本/恢复 | `tests/integration/content-pipeline.test.ts` |
| 发布记录（读/重试/取消/提交） | `tests/integration/publishing-boundary.test.ts`、`publish-execution.test.ts`、`publish-handoff.test.ts` |
| 参考导入与导入任务 | `tests/integration/reference-flow.test.ts`、`agent-protocol.test.ts` |
| Agent Run / 卡片动作 / 会话 | `tests/integration/agent-actions.test.ts`、`agent-protocol.test.ts` |
| ProcessingJob | `tests/integration/agent-actions.test.ts`、`agent-protocol.test.ts` |
| 指标采集与复盘 | `tests/integration/performance-metrics.test.ts` |
| AiToEarn 连接状态 | `tests/integration/aitoearn-connection.test.ts` |

已知覆盖边界（如实记录）：现有隔离测试打在 service 层（与路由共用同一鉴权入口 `requireUser` + userId 透传）；HTTP 路由层的端到端越权探测未单独建档。`BenchmarkNote` 经 `account.userId` 归属校验，由 benchmark/reference 相关测试间接覆盖。

## 7. 部署与运行（对照 `docs/OPERATIONS.md`）

- 生产编排：`deploy/docker-compose.prod.yml`（Caddy HTTPS + web + worker + migrate + db + redis + backup），安全响应头齐备（HSTS/nosniff/DENY），敏感值全部来自 `deploy/.env.production`（不入库、不进镜像）。
- Web 健康：容器级 healthcheck 打 `/api/health`；Caddy 依赖 web healthy 后才启动。
- **Worker 存活边界（已知限制）**：BullMQ Worker 无 HTTP 健康端点，靠 `restart: unless-stopped` 保活 + `SIGTERM` 优雅退出（`worker/index.ts`）。日常巡检用 `docker compose ps` + `logs worker`；若需更强保障，后续可加队列心跳探针，不在 C12 范围。
- 媒体隐私：worker 临时目录为 2GB tmpfs，任务成败均清理，重启不残留原视频。

## 8. 已知限制（内测沟通口径）

1. **真实发布未验收**：mock 发布状态机完整（submitted/awaiting_user/failed/canceled/重试/幂等），但从未调用真实 AiToEarn；真实授权、上传、短链、连续 5 次发布需凭证后人工验收。
2. **真实抓取/转写/生成未验收**：TikHub 20 样本成功率、Qwen-ASR 真实转写、DeepSeek 真实生成均只有契约夹具证据。
3. **指标与复盘**：D+1/D+3/D+7 队列与处理器就绪，mock 指标链路通过；真实准点率与误判规则需真实发布数据。
4. **登录**：开发旁路完备，Resend 真实魔法链接未演练。
5. **部署**：Linux 生产编排文件与文档齐备，但未在真实服务器部署，未做备份恢复演练与 Lighthouse 验收。
6. mock 发布记录存于 dev server 进程内存，重启后显式报「模拟发布记录不存在」，不伪造状态。

## 9. 就绪结论（三分类）

| 分类 | 内容 |
|---|---|
| ✅ 可立即做 mock 内测走查 | Chat-first 创作全链路（对话/卡片/导入/生成/改写/版本/Artifact）、热点→选题隔离流、发布状态机演示、复盘与指标页面、连接设置、移动端 390×844、a11y 基线、跨用户隔离与凭证脱敏 |
| 🔑 阻塞于真实凭证 | Resend 登录、TikHub 样本验收、Qwen-ASR 转写、DeepSeek 生成、AiToEarn 授权与真实发布、真实 D+N 指标 |
| 🖥️ 需要真实服务器人工执行 | Linux 部署 `deploy/docker-compose.prod.yml`、HTTPS 域名、备份恢复演练、来源监控、3–5 名内测用户接入 |
