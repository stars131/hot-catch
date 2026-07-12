import { describe, expect, it } from "vitest";
import type { PublishStatus } from "@prisma/client";
import {
  PUBLISH_FINAL_STATUSES,
  PUBLISH_IN_FLIGHT_STATUSES,
  PUBLISH_STATUS_TRANSITIONS,
  PUBLISH_SUBMITTABLE_STATUSES,
  assertPublishTransition,
  canTransitionPublishStatus,
  isPublishRecordCancelable,
  isPublishRecordRetryable,
} from "@/lib/services/publish-state-machine";

const ALL_STATUSES: PublishStatus[] = [
  "draft",
  "scheduled",
  "uploading",
  "submitted",
  "awaiting_user",
  "published",
  "failed",
  "canceled",
];

describe("publish state machine", () => {
  it("covers every PublishStatus in the transition table", () => {
    expect(Object.keys(PUBLISH_STATUS_TRANSITIONS).sort()).toEqual(
      [...ALL_STATUSES].sort(),
    );
  });

  it("allows the normal forward path draft → submitted → awaiting_user → published", () => {
    expect(canTransitionPublishStatus("draft", "submitted")).toBe(true);
    expect(canTransitionPublishStatus("submitted", "awaiting_user")).toBe(true);
    expect(canTransitionPublishStatus("awaiting_user", "published")).toBe(true);
    expect(canTransitionPublishStatus("scheduled", "uploading")).toBe(true);
    expect(canTransitionPublishStatus("uploading", "submitted")).toBe(true);
  });

  it("allows provider-side skips but never a backward move", () => {
    // 供应商可能跳步
    expect(canTransitionPublishStatus("draft", "awaiting_user")).toBe(true);
    expect(canTransitionPublishStatus("scheduled", "published")).toBe(true);
    // 禁止回退
    expect(canTransitionPublishStatus("awaiting_user", "submitted")).toBe(false);
    expect(canTransitionPublishStatus("submitted", "draft")).toBe(false);
    expect(canTransitionPublishStatus("awaiting_user", "uploading")).toBe(false);
  });

  it("treats published and canceled as absolute final states", () => {
    for (const finalStatus of ["published", "canceled"] as const) {
      expect(PUBLISH_FINAL_STATUSES.has(finalStatus)).toBe(true);
      for (const target of ALL_STATUSES) {
        if (target === finalStatus) continue;
        expect(canTransitionPublishStatus(finalStatus, target)).toBe(false);
      }
    }
  });

  it("lets a failed record recover: retry resubmission or late success discovered by query", () => {
    expect(canTransitionPublishStatus("failed", "submitted")).toBe(true);
    // 超时后查询发现供应商其实已推进
    expect(canTransitionPublishStatus("failed", "awaiting_user")).toBe(true);
    expect(canTransitionPublishStatus("failed", "published")).toBe(true);
    expect(canTransitionPublishStatus("failed", "canceled")).toBe(true);
    expect(canTransitionPublishStatus("failed", "draft")).toBe(false);
  });

  it("treats same-status sync as a no-op transition", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransitionPublishStatus(status, status)).toBe(true);
    }
  });

  it("assertPublishTransition throws a 409 CONFLICT AppError on illegal moves", () => {
    expect(() => assertPublishTransition("published", "failed")).toThrowError(
      /发布状态不能从 published 变为 failed/,
    );
    try {
      assertPublishTransition("canceled", "submitted");
      expect.unreachable("must throw");
    } catch (error) {
      expect(error).toMatchObject({ code: "CONFLICT", statusCode: 409 });
    }
    expect(() => assertPublishTransition("draft", "submitted")).not.toThrow();
  });

  it("only failed records are retryable; in-flight and final states are not", () => {
    expect(isPublishRecordRetryable("failed")).toBe(true);
    for (const status of ALL_STATUSES.filter((item) => item !== "failed")) {
      expect(isPublishRecordRetryable(status)).toBe(false);
    }
  });

  it("everything except published/canceled is cancelable", () => {
    expect(isPublishRecordCancelable("published")).toBe(false);
    expect(isPublishRecordCancelable("canceled")).toBe(false);
    for (const status of ["draft", "scheduled", "uploading", "submitted", "awaiting_user", "failed"] as const) {
      expect(isPublishRecordCancelable(status)).toBe(true);
    }
  });

  it("keeps submittable and in-flight sets disjoint and complete", () => {
    for (const status of PUBLISH_SUBMITTABLE_STATUSES) {
      expect(PUBLISH_IN_FLIGHT_STATUSES.has(status)).toBe(false);
      expect(PUBLISH_FINAL_STATUSES.has(status)).toBe(false);
    }
    // 每个状态要么可提交、要么在途、要么终态
    for (const status of ALL_STATUSES) {
      expect(
        PUBLISH_SUBMITTABLE_STATUSES.has(status) ||
          PUBLISH_IN_FLIGHT_STATUSES.has(status) ||
          PUBLISH_FINAL_STATUSES.has(status),
      ).toBe(true);
    }
  });
});
