# ADR 0003：邀请制邮件登录与用户级凭证

- 状态：已采纳
- 日期：2026-07-11

生产环境使用 Auth.js、Prisma Adapter 与 Resend 邮件魔法链接。只有未过期且未撤销的邀请邮箱可以登录。开发身份旁路仅在非生产环境且 `DEV_AUTH_BYPASS=1` 时可用。

TikHub、Qwen-ASR、AiToEarn、DeepSeek、Firecrawl 与生产 Cookie 都属于用户级凭证，采用 AES-256-GCM 加密。浏览器、API 响应和日志不返回原文。
