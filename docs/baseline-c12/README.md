# C12 基线：内测加固最终 QA 截图

> 生成时间：2026-07-12（C12 批次）
> 运行环境：本地 dev server（`DEV_AUTH_BYPASS=1`、`PUBLISH_PROVIDER_MODE=mock`），未调用任何真实付费供应商；热点页为真实聚合数据 + 显式不可用来源提示。
> 采集方式：Playwright Chromium，桌面 1440×900 与手机 390×844；脚本对每页断言 `scrollWidth ≤ clientWidth`（无页面级横向溢出），并收集控制台错误。

## 截图清单

| 文件 | 视口 | 证明内容 |
|---|---|---|
| `home-creator-desktop.png` | 1440×900 | Chat-first 创作首屏：会话列表 + 「今天想创作什么?」+ Composer + 4 个轻量入口；无项目大表单、无常驻三栏 |
| `home-creator-mobile.png` | 390×844 | 单栏对话式首屏，Composer 固定底部，创作态无全局底部导航遮挡 |
| `hotspots-desktop.png` | 1440×900 | 热点研究页标注「这里不直接生成内容」；9 个不可用来源显式列出原因（不掩盖故障）；无任何“生成内容”按钮，仅可收藏到选题库 |
| `hotspots-mobile.png` | 390×844 | 热点页手机布局无横向溢出 |
| `publish-desktop.png` | 1440×900 | 「本地模拟模式」横幅明示不调用真实 AiToEarn；无凭证时「连接未配置」显式面板 + 前往连接设置 CTA，不用模拟账号代替 |
| `publish-mobile.png` | 390×844 | 发布中心手机布局与显式状态 |
| `retrospectives-desktop.png` | 1440×900 | 数据复盘页（D+1/D+3/D+7 框架）空/等待状态诚实呈现 |
| `retrospectives-mobile.png` | 390×844 | 复盘页手机布局 |
| `settings-connections-desktop.png` | 1440×900 | 连接设置：AES-256-GCM 加密提示、各供应商「未配置」诚实状态、只显示尾号提示不回传原文 |
| `settings-connections-mobile.png` | 390×844 | 连接设置手机布局 |
| `a11y-focus-creator-desktop.png` | 1440×900 | 键盘 Tab 后焦点落在「新建创作」按钮，焦点环清晰可见（focus-visible 生效） |

## 控制台错误说明（诚实记录）

`/publish` 页面存在 2 条资源级 console error：无 AiToEarn 凭证时 `/api/publish/flows` 按设计返回 422 `connection_required`（浏览器把非 2xx fetch 记为资源错误）。这是显式失败状态而非 JS 异常，对应 e2e `publish-flow.spec.ts`「without a credential the publish flow returns explicit connection_required」用例。其余页面桌面与手机均无控制台错误。

## 对应验证（C12 全量，2026-07-12 实测）

- `npm run typecheck` ✅
- `npm run lint -- --max-warnings=0` ✅
- `npm run test:unit`：15 文件 136 用例 ✅
- `npm run test:contract`：5 文件 22 用例 ✅
- `npm run test:integration`：12 文件 79 用例 ✅（含 C12 新增 5 个跨用户隔离用例）
- `npm run build` ✅（需先清理残留 node 进程释放 Prisma DLL 文件锁，见运行说明）
- `npm run test:e2e`：52/52 通过（5.1 分钟，含 6 个 @a11y axe 扫描用例、smoke、C2–C11 全部流程测试）

## 已知边界

- 所有供应商链路仍为 mock/契约夹具验证；真实 TikHub/Qwen-ASR/DeepSeek/AiToEarn/Resend 验收需真实凭证（见 `docs/internal-beta.md` 第 3、8、9 节）。
- 本批修复 `upsertPersona` 跨用户越权更新漏洞（`lib/services/persona-service.ts`），回归用例在 `tests/integration/user-isolation.test.ts`。
