# C10 基线：本地发布执行状态机与 provider-safe API shell

> 生成时间：2026-07-12
> 运行环境：`PUBLISH_PROVIDER_MODE=mock`（本地模拟供应商 + 契约夹具），全程未调用真实 AiToEarn，未上传真实素材，未产生真实发布。

## 截图清单

| 文件 | 视口 | 证明内容 |
|---|---|---|
| `publish-connection-required-desktop.png` | 1440×900 | 无凭证时发布中心显式"连接未配置"面板 + 连接 CTA；API 同步返回 422 `connection_required`，不创建悬空记录 |
| `publish-connection-required-mobile.png` | 390×844 | 同上，单栏布局无横向溢出 |
| `publish-mock-workspace-desktop.png` | 1440×900 | 保存夹具凭证后：本地模拟模式横幅、模拟账号列表加载、页面不出现凭证原文 |
| `publish-awaiting-user-desktop.png` | 1440×900 | 抖音模拟发布 submitted → awaiting_user：等待确认徽标、"还差用户确认"卡、短链按钮指向契约夹具 `https://v.douyin.com/fixture/` |
| `publish-awaiting-user-mobile.png` | 390×844 | awaiting_user 状态卡与短链按钮在手机可用，无横向溢出 |
| `publish-failed-desktop.png` | 1440×900 | 模拟失败账号：失败徽标 + 可读失败原因（契约夹具）+ 重试按钮 |
| `publish-retry-recovered-desktop.png` | 1440×900 | 失败记录受控重试后恢复到 awaiting_user，无重复发布 |
| `publish-canceled-desktop.png` | 1440×900 | 在途记录取消后"已取消"终态；列表同屏展示 已取消/等待确认/已提交 多状态 |

## 对应 e2e

`tests/e2e/publish-flow.spec.ts`（5 个用例，串行）：

1. 无凭证 → flows/assets sign 均返回显式 `connection_required`（422），UI 显示连接面板，不创建发布记录。
2. 保存夹具凭证 → 模拟模式横幅 + 模拟账号加载 + 凭证原文不出现在页面。
3. 完整发布流：选择内容/账号 → 模拟素材登记（不发送真实文件）→ 提交 202 → submitted → 轮询推进 awaiting_user + 夹具短链；同一 `Idempotency-Key` 重放返回同一记录且 `attemptCount` 不变；手机 390×844 复验。
4. 失败路径：模拟失败账号 → failed（含原因）→ 受控重试 → awaiting_user 恢复。
5. 取消路径：在途记录取消 → canceled 终态；重复取消/重试均被 409 拒绝。

## 已知边界

- 模拟供应商刻意**不产生 `published` 状态**（不声称真实发布成功）；`published` 相关转换由单元测试覆盖。
- 模拟状态存于 dev server 进程内存（`globalThis`）：重启 server 后旧记录的供应商侧状态会丢失，刷新时显式报"模拟发布记录不存在"，不伪造状态。
- 真实 AiToEarn 提交/上传/短链/取消仍未验收，需要真实凭证并显式设置 `PUBLISH_PROVIDER_MODE=real` 后按计划 C10（真实验收）执行。
