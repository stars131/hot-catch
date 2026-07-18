# Claude 项目执行约束

开始任何修改前，先完整阅读：

1. `CONTEXT.md`
2. `docs/CLAUDE_CREATOR_AGENT_PLAN.md`
3. 本任务涉及的现有源码和测试

## 必须遵守

- 当前工作区有大量未提交改动，均视为用户资产。每批开始先执行 `git status --short` 与 `git diff --stat`，禁止 `git reset --hard`、`git checkout --`、清空目录、覆盖式重写无关文件。
- 一次只执行计划中的一个批次。完成该批次的测试、浏览器截图和交付说明后停止，等待用户验收；不要一次修改整个系统。
- 创作页必须是 Chat-first：对话是默认主界面，正式内容通过对话内 Artifact 卡出现，精细编辑器按需打开。禁止恢复“左聊天 + 中间密集表单 + 右评分/版本”的常驻三栏。
- 实际创作、链接导入、选项确认、生成、改写、评分都要能从对话发起。卡片只传稳定 action ID，不允许客户端执行供应商 URL、任意命令或任意代码。
- 正式内容必须落到 `GeneratedContent + ContentRevision`，不能只存在聊天文本或 React state。异步动作必须落到 `ProcessingJob`，不能只存在进度条。
- 热点与创作继续隔离：`/hotspots` 只能收藏到 `/ideas`，不得出现“直接生成内容”。
- 保留现有 Provider、BullMQ、认证、凭证加密、发布幂等、指标和复盘能力；除非当批计划明确要求，不重写技术栈或数据库体系。
- 生产环境不得用 mock 掩盖错误。没有真实供应商凭证时只能报告“模拟/契约测试通过”，不能声称真实接入验收通过。
- 所有业务查询必须验证当前 `userId`；涉及 `BenchmarkNote` 时通过 `account.userId` 验证归属。
- 外接 Skill 第一阶段只做内置注册表和稳定协议，不开放任意 URL、动态 npm 包、`eval` 或浏览器端执行。

## 每批最低验证

```bash
npm run lint -- --max-warnings=0
npm run typecheck
npm run test:unit
npm run test:contract
npm run test:integration
```

涉及界面时还必须：

- 使用真实浏览器验证 `1440×900` 与 `390×844`。
- 检查页面级横向溢出、控制台错误、焦点、键盘、空/加载/失败/等待输入状态。
- 更新并运行对应 Playwright 流程测试；仅页面标题可见不算验收。

## 每批交付格式

- 完成了什么。
- 修改了哪些文件。
- 保留了哪些旧能力。
- 执行了哪些测试及结果。
- 桌面与手机截图证明什么。
- 仍未完成或需要真实凭证验证的内容。

