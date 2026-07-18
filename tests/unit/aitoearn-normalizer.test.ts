import { describe, expect, it } from "vitest";
import {
  mapPublishStatus,
  normalizeAccounts,
  normalizePublishRecord,
} from "@/lib/providers/aitoearn/normalizer";

describe("AiToEarn normalization", () => {
  it("maps documented numeric states", () => {
    expect(mapPublishStatus(8)).toBe("awaiting_user");
    expect(mapPublishStatus(-1)).toBe("failed");
    expect(mapPublishStatus(9)).toBe("canceled");
    expect(mapPublishStatus(0)).toBe("scheduled");
    expect(mapPublishStatus(2)).toBe("submitted");
    expect(mapPublishStatus(2, "https://example.com/work")).toBe("published");
  });

  it("keeps only supported beta accounts", () => {
    const accounts = normalizeAccounts({
      data: {
        list: [
          { id: "xhs-1", type: "xiaohongshu", nickname: "小红书账号", status: 0 },
          { id: "dy-1", type: "douyin", nickname: "抖音账号", status: 1 },
          { id: "youtube-1", type: "youtube", nickname: "不在本期", status: 0 },
        ],
      },
    });
    expect(accounts).toHaveLength(2);
    expect(accounts[1]).toMatchObject({ platform: "douyin", status: "expired" });
  });

  it("does not treat a failed record as published", () => {
    expect(
      normalizePublishRecord({
        data: { id: "record-1", status: 5, errorMsg: "平台拒绝" },
      }),
    ).toMatchObject({ status: "failed", failureReason: "平台拒绝" });
  });
});
