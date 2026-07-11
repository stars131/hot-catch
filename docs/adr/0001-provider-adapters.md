# ADR 0001：供应商通过稳定适配器接入

- 状态：已采纳
- 日期：2026-07-11

业务层只依赖 `SocialDataProvider`、`TranscriptionProvider`、`PublishingProvider`、`LlmProvider` 和 `WebReferenceProvider`。TikHub、Qwen-ASR、AiToEarn、DeepSeek 与 Firecrawl 的字段变化必须在各自适配器和契约夹具中消化，禁止把供应商 JSON 直接传到页面或业务服务。

这样可以在供应商接口变化、凭证失效或切换实现时保留稳定的数据模型，并允许 CI 使用脱敏夹具而不调用付费服务。
