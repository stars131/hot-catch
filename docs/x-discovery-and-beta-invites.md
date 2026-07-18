# X 信息检索与限量邀请码

> 更新：2026-07-18
> 边界：只收集 X 上公开可见的数据；不读取私密账号，不使用账号池、Cookie 轮换、代理池或浏览器登录态。

## 1. 无凭证检索（默认）

打开「热点研究 → X 专项检索」即可直接使用，不需要 X Developer 账号、Bearer Token 或 X 登录态。

默认数据源为 [FxTwitter public API](https://docs.fxembed.com/api/introduction/)，其公开端点覆盖搜索、趋势、用户资料和时间线；本项目已在 2026-07-18 对以下端点进行了真实联网验证：

- `GET https://api.fxtwitter.com/2/trends`
- `GET https://api.fxtwitter.com/2/search?q=...`
- `GET https://api.fxtwitter.com/2/profile/:handle`
- `GET https://api.fxtwitter.com/2/profile/:handle/statuses`

三类检索的实际行为：

- 地区热点：全球使用公开趋势流；国家预设使用 `place_country` 地理操作符；城市预设使用国家标记加地区关键词。地区结果展示热门原帖及其公开互动，避免把关键词搜索伪装成官方地区趋势榜。
- 话题 / 领域：调用公开搜索端点的热门结果，默认排除转帖，再按赞、转帖、回复、引用和收藏计算可解释互动分。
- 指定博主：并行读取用户公开资料与时间线。某个账号受限或失败时，其余账号仍正常返回。

公开结果缓存 5 分钟；登录用户每分钟最多触发 20 次非缓存检索。可通过 `X_PUBLIC_API_BASE` 指向自建或受信任的 FxEmbed 实例。公开实例是第三方服务，覆盖率和可用性可能随 X 上游变化，因此结果区始终显示数据源、采集时间、覆盖范围和原始 X 证据链接。

参考实现：

- [FxEmbed/FxEmbed](https://github.com/FxEmbed/FxEmbed)（MIT）及其[公开 API 文档](https://docs.fxembed.com/api/introduction/)
- [ythx-101/x-tweet-fetcher](https://github.com/ythx-101/x-tweet-fetcher)（MIT）：参考公开后端路由、统一响应和明确错误边界
- [zedeus/nitter](https://github.com/zedeus/nitter)：时间线与搜索的可自建方案；当前自建实例仍需由实例维护者准备 X 会话，因此不作为本项目默认入口

## 2. 可选的 X 官方 API

1. 在 X Developer Console 创建项目与应用，取得只读 Bearer Token。
2. 登录星迹，在「设置 → 连接设置 → X API」中保存 Token。
3. 系统会自动优先选择官方端点：
   - 地区热点：调用 `GET /2/trends/by/woeid/:id`。
   - 话题 / 领域：调用 `GET /2/tweets/search/recent`，默认排除转帖并返回作者与公开互动指标。
   - 指定博主：先用 `GET /2/users/by?usernames=...` 批量解析账号，再并发调用 `GET /2/users/:id/tweets`。

凭证按用户使用 AES-256-GCM 加密落库；浏览器和 API 响应都不会返回 Token 原文。官方结果缓存 2 分钟，响应头中的剩余额度会显示在结果区。官方凭证无效、限速或临时不可用时，系统自动降级到公开 OSINT 数据源并显示提示，不会要求用户先配置凭证。

参考与验证来源：

- [X API Overview](https://docs.x.com/x-api/overview)
- [Trends by WOEID](https://docs.x.com/x-api/trends/get-trends-by-woeid)
- [Search operators](https://docs.x.com/x-api/posts/search/integrate/operators)
- [Search integration guide](https://docs.x.com/x-api/posts/search/integrate/overview)
- [User timelines](https://docs.x.com/x-api/posts/timelines/introduction)
- [X API rate limits](https://docs.x.com/x-api/fundamentals/rate-limits)
- [xdevplatform/samples](https://github.com/xdevplatform/samples)
- [xdevplatform/xmcp](https://github.com/xdevplatform/xmcp)

OSINT 工程参考：`vladkens/twscrape` 的并发、部分失败和限速状态值得借鉴，但它的账号池、Cookie 与代理轮换会扩大合规和封号风险，因此本项目不采用这些入口。结果统一保留查询、采集时间、数据源、覆盖边界、原始 X URL、作者和公开指标，便于回溯证据。

## 3. 创建限量邀请码

数据库迁移完成后，创建一个最多允许 20 个注册用户、14 天有效的共享邀请码：

```bash
npm run invite:code:create -- "首轮内测" 20 14
```

命令只显示一次邀请码明文，同时输出可直接发送的注册 URL。数据库只保存 SHA-256 哈希和尾号提示。

查看每个邀请码的已注册、待确认和剩余名额：

```bash
npm run invite:code:list
```

名额规则：

- 首次提交邮箱与邀请码时，系统预留一个名额；预留 24 小时内未完成魔法链接登录会自动释放。
- 同一邀请码的领取在 Postgres 事务级 advisory lock 内串行执行，不会因并发而超发。
- 登录成功后邮箱变为已注册资格，邀请码过期不会影响后续登录。
- 原有 `npm run invite:create -- email@example.com 14` 邮箱白名单仍然可用，适合单独邀请。

## 4. 真实验收边界

单元测试覆盖官方与公开数据源的请求构造、响应归一化、排序、部分失败、限速及降级边界；集成测试覆盖邀请码名额和并发领取。无凭证公开端点已经进行真实联网验证。由于 X 公开内容和第三方实例持续变化，部署后仍应定期冒烟测试全球趋势、一个国家地区、一个话题和两个博主；如果启用官方 Token，再单独记录 X Developer Console 的权限、限速和实际计费。
