# 星迹内容助手内测运维手册

> 内测就绪检查表、环境变量 mock/real 边界、凭证就绪清单见 `docs/internal-beta.md`（C12）。

## 首次部署

1. 准备一台已安装 Docker Engine 与 Compose v2 的 Linux 主机，域名 A/AAAA 记录指向该主机，并开放 80、443 TCP/UDP。
2. 复制 `deploy/.env.production.example` 为 `deploy/.env.production`，填写所有必填值。`AUTH_SECRET` 与 `CREDENTIAL_ENCRYPTION_KEY` 必须独立生成。
3. 在仓库根目录执行：

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml config --quiet
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml up -d --build
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml ps
curl --fail https://你的域名/api/health
```

`migrate` 必须成功结束后 Web 与 Worker 才会启动。Caddy 自动申请并续期 HTTPS 证书。生产环境固定关闭开发身份旁路，供应商 Key 由每位用户在连接设置中独立保存。

## 邀请用户

在 Worker 容器内创建邀请：

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml run --rm worker npm run invite:create -- creator@example.com
```

只有未过期、未撤销的邀请邮箱可以通过 Resend 魔法链接登录。

## 日常检查

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml ps
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml logs --since 30m web worker caddy
curl --fail https://你的域名/api/health
```

健康接口只有在 PostgreSQL 与 Redis 都可用时返回 200。依赖失败时产品会显示明确状态，不会回退到演示数据。

### Worker 存活巡检

BullMQ Worker 没有 HTTP 健康端点，靠 `restart: unless-stopped` 保活，收到 `SIGTERM` 时会关闭全部队列消费者并断开数据库（`worker/index.ts`）。巡检方式：

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml ps worker
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml logs --since 30m worker
```

若发布/导入任务长期停留在 `queued`，优先检查 worker 容器状态与 Redis 连通性，再检查对应用户凭证状态；不要用手工改库的方式“推进”任务状态。

## 备份与恢复

`backup` 服务每天生成一个 PostgreSQL custom-format 备份到 `deploy/backups/`，自动删除超过 7 天的文件。至少每月把备份复制到另一台主机或对象存储，并做一次恢复演练。

恢复会覆盖目标数据库，先停止 Web 与 Worker，并确认文件名：

```bash
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml stop web worker
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml exec -T db dropdb -U startrace --if-exists startrace
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml exec -T db createdb -U startrace startrace
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml exec -T db pg_restore -U startrace -d startrace --clean --if-exists < deploy/backups/startrace-YYYYMMDDTHHMMSSZ.dump
docker compose --env-file deploy/.env.production -f deploy/docker-compose.prod.yml start web worker
```

如果修改了 `POSTGRES_USER` 或 `POSTGRES_DB`，恢复命令必须使用实际值。恢复后检查 `/api/health`、用户登录、最近内容版本和发布记录。

## 升级与回滚

升级前先确认最新备份可读，再拉取代码并执行 `up -d --build`。数据库迁移只允许向前执行；需要应用回滚时回到上一镜像，但不要自动回滚数据库。若迁移破坏兼容性，使用演练过的备份恢复流程。

## 临时媒体与隐私

Worker 的 `/tmp/startrace` 使用 2 GB tmpfs；任务成功、失败都会执行应用层清理，容器重启也不会留下原视频。生产库仅保存来源链接、转写、分析和证据。生产环境不会读取 `.hotspot-cookies.local.json`，Cookie 进入用户级加密凭证。

## 本地 E2E 运行要求(C4/C5 验证基线)

Playwright 会自行启动 `next dev -p 3100`(带 `DEV_AUTH_BYPASS=1`),但有两个本机前提:

1. **代理放行本机回环**。本机若开启 Clash 类代理(`HTTP_PROXY/HTTPS_PROXY`),健康检查会被代理挂住导致 180 秒假超时,必须以 `NO_PROXY='127.0.0.1,localhost'` 前缀运行。
2. **BullMQ Worker 是独立进程**,涉及导入/生成任务的用例(如 `creator-reference.spec.ts`)需要先手动启动 Worker;`tsx` 不读取 `.env`,需显式传入连接串:

```bash
# 终端 1:Worker(仅任务类用例需要;creator-artifact.spec.ts 纯 API+DB,可不启动)
DATABASE_URL="postgresql://xhs:xhs_password@127.0.0.1:5432/xhs_benchmark?schema=public" \
REDIS_URL="redis://127.0.0.1:6379" \
URL_GUARD_ALLOWLIST="127.0.0.1" \
NO_PROXY='127.0.0.1,localhost' npm run worker

# 终端 2:全量 E2E
NO_PROXY='127.0.0.1,localhost' npm run test:e2e
```

另注意:`playwright.config.ts` 的 `reuseExistingServer` 在非 CI 下为 true,若 3100 端口残留旧代码的 dev server,会导致新接口 500;跑测试前确认 3100 未被旧进程占用。开发库按 CONTEXT.md 走 `prisma db push`,不要在本机执行 `migrate dev`(会因迁移记账缺失要求 reset)。
