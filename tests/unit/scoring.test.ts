import { describe, expect, it } from "vitest";
import { scoreContent } from "@/lib/scoring/score";

describe("publication scoring", () => {
  it("scores a complete Xiaohongshu draft above an empty draft", () => {
    const complete = scoreContent({
      kind: "xhs_graphic",
      structuredContent: {
        title: "普通人也能执行的五步内容复盘法",
        titleOptions: ["标题一足够长", "标题二足够长", "标题三足够长"],
        coverTextOptions: ["五步复盘", "今天就能用"],
        pages: Array.from({ length: 4 }, (_, index) => ({
          pageNumber: index + 1,
          heading: `步骤 ${index + 1}`,
          body: "这是一段包含明确方法和例子的页面正文。",
          visualSuggestion: "暖白底色配手写批注",
        })),
        bodyText: "方法与案例".repeat(80),
        tags: ["内容创作", "复盘", "效率"],
        interactionEnding: "你最想先试哪一步？",
        riskNotes: ["数据仅作为示例"],
      },
    });
    const empty = scoreContent({ kind: "xhs_graphic" });
    expect(complete.total).toBeGreaterThan(empty.total);
    expect(complete.total).toBeGreaterThanOrEqual(90);
  });

  it("detects a discontinuous Douyin timeline", () => {
    const result = scoreContent({
      kind: "douyin_video_script",
      structuredContent: {
        title: "三十秒学会复盘",
        hook: "别再凭感觉复盘",
        durationSec: 12,
        caption: "这是一段完整的发布文案，说明视频能带来的具体价值。",
        tags: ["复盘", "效率", "创作"],
        riskNotes: ["避免绝对化表达"],
        shots: [
          { startSec: 0, endSec: 3, voiceover: "开场", visual: "正面", subtitle: "开场", camera: "近景", transition: "切", music: "轻快", risk: "" },
          { startSec: 5, endSec: 12, voiceover: "正文", visual: "屏幕", subtitle: "正文", camera: "特写", transition: "切", music: "轻快", risk: "" },
        ],
      },
    });
    expect(result.warnings).toContain("时间轴需连续且不重叠");
  });
});
