import { describe, expect, it } from "vitest";
import {
  formatSeconds,
  shotIssuesAt,
  validateStoryboard,
} from "@/lib/content/storyboard";

function shot(startSec: number, endSec: number) {
  return { startSec, endSec, voiceover: "口播", visual: "画面", subtitle: "字幕" };
}

describe("validateStoryboard", () => {
  it("passes a continuous timeline that matches the declared duration", () => {
    const result = validateStoryboard({
      durationSec: 30,
      shots: [shot(0, 3), shot(3, 18), shot(18, 30)],
    });
    expect(result.issues).toEqual([]);
    expect(result.timelineEnd).toBe(30);
    expect(result.declaredDuration).toBe(30);
  });

  it("flags a first shot that does not start at zero", () => {
    const result = validateStoryboard({ durationSec: 10, shots: [shot(1, 10)] });
    expect(result.issues.some((issue) => issue.message.includes("第一镜"))).toBe(true);
    expect(shotIssuesAt(result, 0).length).toBeGreaterThan(0);
  });

  it("flags non-positive shot spans and discontinuities per shot", () => {
    const result = validateStoryboard({
      durationSec: 20,
      shots: [shot(0, 5), shot(5, 5), shot(9, 20)],
    });
    expect(shotIssuesAt(result, 1).join(" ")).toContain("结束时间必须晚于开始时间");
    expect(shotIssuesAt(result, 2).join(" ")).toContain("不连续");
  });

  it("tolerates ≤0.2s gaps between shots like the generation schema", () => {
    const result = validateStoryboard({
      durationSec: 10,
      shots: [shot(0, 4.8), shot(5, 10)],
    });
    expect(result.issues).toEqual([]);
  });

  it("flags total duration mismatch beyond one second as an overall issue", () => {
    const result = validateStoryboard({
      durationSec: 40,
      shots: [shot(0, 3), shot(3, 30)],
    });
    const overall = result.issues.filter((issue) => issue.shotIndex === null);
    expect(overall).toHaveLength(1);
    expect(overall[0].message).toContain("总时长");
  });

  it("handles missing or malformed structured content without throwing", () => {
    expect(validateStoryboard(null).issues).toEqual([]);
    expect(validateStoryboard({ shots: "oops" }).issues).toEqual([]);
    expect(validateStoryboard({ shots: [{}] }).timelineEnd).toBe(0);
    // durationSec 缺失时不做总时长比对
    const noDuration = validateStoryboard({ shots: [shot(0, 5)] });
    expect(noDuration.declaredDuration).toBeNull();
    expect(noDuration.issues).toEqual([]);
  });
});

describe("formatSeconds", () => {
  it("renders integers without decimals and keeps one decimal otherwise", () => {
    expect(formatSeconds(30)).toBe("30s");
    expect(formatSeconds(3.5)).toBe("3.5s");
    expect(formatSeconds(3.1400001)).toBe("3.1s");
  });
});
