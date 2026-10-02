import { describe, expect, it } from "vitest";
import fixture from "@/tests/fixtures/tikhub/xhs-note.json";
import { buildBriefFromNote } from "@/lib/creator/reference-brief";
import { assessContentReadiness, type ReadinessInput } from "@/lib/creator/publish-readiness";
import { measureReferenceOverlap, referenceTextsOf } from "@/lib/content/reference-overlap";

/**
 * 参考原文逐字重合:用契约夹具中的小红书作品构建真实形状的 ReferenceBrief,
 * 对比「照搬」与「按结构改写」两种草稿。
 */

const note = fixture.data.note;
const brief = buildBriefFromNote(
  {
    title: note.title,
    content: note.desc,
    transcript: null,
    noteUrl: "https://www.xiaohongshu.com/explore/65f0000000000000000abc01",
    contentType: "normal",
    durationSec: null,
    analysis: null,
    account: { nickname: note.user.nickname },
  },
  "xiaohongshu",
);
const referenceTexts = referenceTextsOf(brief);

const COPIED_BODY =
  "第一步：每天记录三件事，大概花5分钟。第二步：每周日花30分钟归纳，把重复出现的问题挑出来。坚持90天后，我的拖延时间从每天2小时降到40分钟。";
const ORIGINAL_BODY =
  "我试过很多复盘模板，最后留下来的只有一个很笨的办法：睡前写下当天卡住的地方，周末把它们排个序，找出反复出现的那一个，下周只解决它。两个月下来，写周报的时间少了一半。";

function draft(body: string): ReadinessInput {
  return {
    contentKind: "xhs_graphic",
    title: "复盘这件事，我只留了一个办法",
    body,
    structured: {
      pages: [{ pageNumber: 1, heading: "开场", body }],
      tags: ["复盘", "效率", "成长"],
    },
    referenceTexts,
  };
}

describe("measureReferenceOverlap", () => {
  it("从 ReferenceBrief 快照取出原文摘录", () => {
    expect(referenceTexts.length).toBeGreaterThan(3);
    expect(referenceTexts.join("")).toContain("每天记录三件事");
  });

  it("换标点和空格不能绕过逐字重合", () => {
    const result = measureReferenceOverlap([COPIED_BODY], referenceTexts);
    expect(result.coverage).toBeGreaterThan(0.8);
    expect(result.longestRun).toBeGreaterThanOrEqual(20);
    expect(result.excerpts[0]).toContain("每天记录三件事");
  });

  it("按结构改写的原创草稿重合为 0", () => {
    const result = measureReferenceOverlap([ORIGINAL_BODY], referenceTexts);
    expect(result.coverage).toBe(0);
    expect(result.longestRun).toBe(0);
  });

  it("英文按单词计数,短于窗口的共同短语不算重合", () => {
    const reference = ["The fastest way to build a habit is to make it tiny and obvious every single day"];
    expect(measureReferenceOverlap(["make it tiny"], reference).coverage).toBe(0);
    expect(
      measureReferenceOverlap(["Honestly the fastest way to build a habit is to make it tiny and obvious"], reference)
        .longestRun,
    ).toBeGreaterThanOrEqual(10);
  });

  it("没有参考时不计算", () => {
    expect(measureReferenceOverlap([COPIED_BODY], []).coverage).toBe(0);
  });

  it("结构异常的旧快照返回空", () => {
    expect(referenceTextsOf(null)).toEqual([]);
    expect(referenceTextsOf("text")).toEqual([]);
    expect(referenceTextsOf({ summary: 3, facts: [null, { excerpt: "数据 1" }] })).toEqual(["数据 1"]);
  });
});

describe("就绪清单接入", () => {
  it("照搬原文时提醒,并给出重合片段,不阻塞", () => {
    const assessment = assessContentReadiness(draft(COPIED_BODY));
    const item = assessment.items.find((entry) => entry.key === "reference.overlap");
    expect(item?.level).toBe("warn");
    expect(item?.detail).toContain("每天记录三件事");
    expect(assessment.blockers).toBe(0);
  });

  it("原创改写通过", () => {
    const item = assessContentReadiness(draft(ORIGINAL_BODY)).items.find(
      (entry) => entry.key === "reference.overlap",
    );
    expect(item?.level).toBe("pass");
  });

  it("没有参考的内容不出现该检查项", () => {
    const { referenceTexts: _omit, ...withoutReferences } = draft(COPIED_BODY);
    void _omit;
    expect(
      assessContentReadiness(withoutReferences).items.some((entry) => entry.key === "reference.overlap"),
    ).toBe(false);
  });
});
