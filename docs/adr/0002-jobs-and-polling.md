# ADR 0002：BullMQ 异步任务与数据库状态

- 状态：已采纳
- 日期：2026-07-11

耗时操作进入 `ingest`、`analysis`、`publish`、`metrics` 四条队列。BullMQ 负责执行、退避和重试，`ProcessingJob` 负责用户可见状态、进度、错误与结果关联。前端每两秒读取任务 API，本期不增加 WebSocket。

数据库记录先于入队创建；入队失败会明确标记 `QUEUE_UNAVAILABLE`。任务使用业务幂等键去重，取消操作同时检查数据库归属和队列状态。
