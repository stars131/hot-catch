import type { JobHandler } from "@/lib/jobs/types";
import { AppError } from "@/lib/errors";

const handlers = new Map<string, JobHandler>();

export function registerJobHandler(action: string, handler: JobHandler) {
  handlers.set(action, handler);
}

export function getJobHandler(action: string) {
  const handler = handlers.get(action);
  if (!handler) {
    throw new AppError("JOB_FAILED", `未注册任务处理器：${action}`, 500);
  }
  return handler;
}

registerJobHandler("system.smoke", async (payload, reportProgress) => {
  await reportProgress(50, "验证队列连接");
  await reportProgress(100, "完成");
  return { output: { echoed: payload.input } };
});
