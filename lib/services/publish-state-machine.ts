import type { PublishStatus } from "@prisma/client";
import { AppError } from "@/lib/errors";

/**
 * C10 本地发布记录状态机。
 *
 * PublishRecord.status 是本地真相源；供应商状态只能沿本表允许的方向收敛：
 * - published / canceled 是终态，任何后续同步都不得改写；
 * - failed 不是终态：允许重试重新提交，也允许"超时后查询发现其实已成功"直接收敛；
 * - 供应商可能跳步（例如 draft 直接回 awaiting_user），所以前向跳转全部允许，
 *   但禁止回退（awaiting_user 不允许退回 submitted）。
 */
export const PUBLISH_STATUS_TRANSITIONS: Record<
  PublishStatus,
  readonly PublishStatus[]
> = {
  draft: ["scheduled", "uploading", "submitted", "awaiting_user", "published", "failed", "canceled"],
  scheduled: ["uploading", "submitted", "awaiting_user", "published", "failed", "canceled"],
  uploading: ["submitted", "awaiting_user", "published", "failed", "canceled"],
  submitted: ["uploading", "awaiting_user", "published", "failed", "canceled"],
  awaiting_user: ["published", "failed", "canceled"],
  failed: ["uploading", "submitted", "awaiting_user", "published", "canceled"],
  published: [],
  canceled: [],
};

/** 终态：不允许再发生任何状态转换，也不允许取消或重试。 */
export const PUBLISH_FINAL_STATUSES: ReadonlySet<PublishStatus> = new Set([
  "published",
  "canceled",
]);

/** 提交型状态：本地记录尚未真正交给供应商，可以发起（或重新发起）提交。 */
export const PUBLISH_SUBMITTABLE_STATUSES: ReadonlySet<PublishStatus> = new Set([
  "draft",
  "scheduled",
  "failed",
]);

/** 在途状态：供应商侧正在执行或等待用户，禁止重复提交。 */
export const PUBLISH_IN_FLIGHT_STATUSES: ReadonlySet<PublishStatus> = new Set([
  "uploading",
  "submitted",
  "awaiting_user",
]);

export function canTransitionPublishStatus(
  from: PublishStatus,
  to: PublishStatus,
): boolean {
  if (from === to) return true;
  return PUBLISH_STATUS_TRANSITIONS[from].includes(to);
}

export function assertPublishTransition(
  from: PublishStatus,
  to: PublishStatus,
): void {
  if (!canTransitionPublishStatus(from, to)) {
    throw new AppError(
      "CONFLICT",
      `发布状态不能从 ${from} 变为 ${to}。`,
      409,
      { from, to },
    );
  }
}

/** 只有明确失败的记录可以重试；在途/终态重试都会造成重复发布风险。 */
export function isPublishRecordRetryable(status: PublishStatus): boolean {
  return status === "failed";
}

/** published / canceled 之后不可取消；其余状态都允许用户主动终止。 */
export function isPublishRecordCancelable(status: PublishStatus): boolean {
  return !PUBLISH_FINAL_STATUSES.has(status);
}
