# 星迹内容助手内测运维手册

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
