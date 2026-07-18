import { describe, expect, it } from "vitest";
import {
  assessContentReadiness,
  missingItemsPrompt,
  readinessStateLabel,
  readinessStateOf,
  type ReadinessInput,
} from "@/lib/creator/publish-readiness";

/**
 * C8 发布就绪纯校验器:小红书与抖音的平台特定检查。
 * 服务端就绪卡与客户端清单共用这一套规则,这里验证判定与聚合逻辑。
 */

const XHS_READY: ReadinessInput = {
  contentKind: "xhs_graphic",
  title: "AI 面试复盘三步法",
  body: "面试完不复盘,同样的问题会再犯一遍。".repeat(5),
  structured: {
    pages: [
      { pageNumber: 1, heading: "开场", body: "为什么要复盘。" },
      { pageNumber: 2, heading: "方法", body: "复盘的三个步骤。" },
    ],
    tags: ["求职", "复盘", "面试"],
    riskNotes: [],
  },
};

const DOUYIN_READY: ReadinessInput = {
  contentKind: "douyin_video_script",
  title: "面试复盘 30 秒讲清",
  body: "面试复盘的完整方法,看完这条就够了。".repeat(3),
  structured: {
    hook: "面试完直接投下一家?你亏大了。",
    durationSec: 30,
    shots: [
      { startSec: 0, endSec: 12, voiceover: "开场:为什么要复盘。", risk: "" },
      { startSec: 12, endSec: 30, voiceover: "方法:三个步骤。", risk: "" },
    ],
    tags: ["求职", "面试"],
    riskNotes: [],
  },
};

function itemOf(input: ReadinessInput, key: string) {
  const assessment = assessContentReadiness(input);
  return assessment.items.find((item) => item.key === key);
}

describe("小红书图文就绪检查", () => {
  it("完整内容判定为 ready,所有项 pass", () => {
    const assessment = assessContentReadiness(XHS_READY);
    expect(assessment.state).toBe("ready");
    expect(assessment.blockers).toBe(0);
    expect(assessment.warnings).toBe(0);
    expect(assessment.items.map((item) => item.key)).toEqual([
      "title",
      "body",
      "pages",
      "tags",
      "risk",
    ]);
  });

  it("空标题与空正文是阻塞项", () => {
    const assessment = assessContentReadiness({ ...XHS_READY, title: " ", body: "" });
    expect(assessment.state).toBe("blocked");
    expect(assessment.blockers).toBe(2);
    expect(itemOf({ ...XHS_READY, title: "" }, "title")?.level).toBe("block");
  });

  it("超长标题、超长正文只是提醒不阻塞", () => {
    const long = assessContentReadiness({
      ...XHS_READY,
      title: "这是一个明显超过二十个字的超长小红书标题会被截断的例子",
      body: "字".repeat(1200),
    });
    expect(long.state).toBe("warnings");
    expect(long.blockers).toBe(0);
    expect(long.items.find((item) => item.key === "title")?.level).toBe("warn");
    expect(long.items.find((item) => item.key === "body")?.level).toBe("warn");
  });

  it("无分页、空页正文、缺标签给出提醒", () => {
    expect(itemOf({ ...XHS_READY, structured: null }, "pages")?.level).toBe("warn");
    expect(
      itemOf(
        {
          ...XHS_READY,
          structured: {
            ...XHS_READY.structured!,
            pages: [{ pageNumber: 1, heading: "空页", body: " " }],
          },
        },
        "pages.empty",
      )?.level,
    ).toBe("warn");
    expect(
      itemOf({ ...XHS_READY, structured: { ...XHS_READY.structured!, tags: [] } }, "tags")
        ?.level,
    ).toBe("warn");
  });

  it("structured 无标签时回退 GeneratedContent.tags", () => {
    const item = itemOf(
      {
        ...XHS_READY,
        structured: { ...XHS_READY.structured!, tags: [] },
        fallbackTags: ["求职"],
      },
      "tags",
    );
    expect(item?.level).toBe("pass");
  });

  it("夸大表述与生成风险提示都会进入风险项", () => {
    const risky = itemOf(
      { ...XHS_READY, body: `${XHS_READY.body}这个方法全网第一,百分百有效。` },
      "risk",
    );
    expect(risky?.level).toBe("warn");
    expect(risky?.detail).toContain("全网第一");

    const noted = itemOf(
      {
        ...XHS_READY,
        structured: { ...XHS_READY.structured!, riskNotes: ["注意求职建议的适用范围"] },
      },
      "risk",
    );
    expect(noted?.level).toBe("warn");
    expect(noted?.detail).toContain("风险提示");
  });
});

describe("抖音脚本就绪检查", () => {
  it("完整脚本判定为 ready", () => {
    const assessment = assessContentReadiness(DOUYIN_READY);
    expect(assessment.state).toBe("ready");
    expect(assessment.items.map((item) => item.key)).toEqual([
      "title",
      "hook",
      "shots.voiceover",
      "shots.timeline",
      "caption",
      "tags",
      "risk",
    ]);
  });

  it("没有分镜与空文案是阻塞项;缺开场钩子只是提醒", () => {
    const noShots = assessContentReadiness({
      ...DOUYIN_READY,
      structured: { ...DOUYIN_READY.structured!, shots: [] },
    });
    expect(noShots.state).toBe("blocked");
    expect(noShots.items.find((item) => item.key === "shots")?.level).toBe("block");

    expect(itemOf({ ...DOUYIN_READY, body: "" }, "caption")?.level).toBe("block");
    expect(
      itemOf(
        { ...DOUYIN_READY, structured: { ...DOUYIN_READY.structured!, hook: "" } },
        "hook",
      )?.level,
    ).toBe("warn");
  });

  it("时间轴断裂与空口播给出提醒,复用分镜校验规则", () => {
    const broken = assessContentReadiness({
      ...DOUYIN_READY,
      structured: {
        ...DOUYIN_READY.structured!,
        shots: [
          { startSec: 0, endSec: 10, voiceover: "开场", risk: "" },
          { startSec: 15, endSec: 30, voiceover: " ", risk: "" },
        ],
      },
    });
    expect(broken.state).toBe("warnings");
    const timeline = broken.items.find((item) => item.key === "shots.timeline");
    expect(timeline?.level).toBe("warn");
    expect(timeline?.detail).toContain("不连续");
    expect(broken.items.find((item) => item.key === "shots.voiceover")?.level).toBe("warn");
  });

  it("分镜风险备注计入风险项", () => {
    const item = itemOf(
      {
        ...DOUYIN_READY,
        structured: {
          ...DOUYIN_READY.structured!,
          shots: [
            { startSec: 0, endSec: 30, voiceover: "口播", risk: "涉及医疗建议表述" },
          ],
        },
      },
      "risk",
    );
    expect(item?.level).toBe("warn");
    expect(item?.detail).toContain("分镜带风险备注");
  });
});

describe("聚合与待处理项指令", () => {
  it("状态聚合:有 block 即 blocked,否则有 warn 即 warnings", () => {
    expect(
      readinessStateOf([
        { key: "a", label: "A", level: "pass" },
        { key: "b", label: "B", level: "warn" },
        { key: "c", label: "C", level: "block" },
      ]),
    ).toBe("blocked");
    expect(
      readinessStateOf([
        { key: "a", label: "A", level: "pass" },
        { key: "b", label: "B", level: "warn" },
      ]),
    ).toBe("warnings");
    expect(readinessStateOf([{ key: "a", label: "A", level: "pass" }])).toBe("ready");
    expect(readinessStateLabel("blocked")).toBe("有阻塞");
  });

  it("missingItemsPrompt 只包含阻塞与提醒项;全部通过时为空", () => {
    const prompt = missingItemsPrompt([
      { key: "title", label: "标题", level: "block", detail: "标题为空" },
      { key: "tags", label: "话题标签", level: "warn", detail: "建议添加 3–6 个" },
      { key: "body", label: "正文", level: "pass", detail: "正文 200 字" },
    ]);
    expect(prompt).toContain("[阻塞] 标题:标题为空");
    expect(prompt).toContain("[提醒] 话题标签");
    expect(prompt).not.toContain("正文 200 字");
    expect(missingItemsPrompt([{ key: "a", label: "A", level: "pass" }])).toBe("");
  });
});
