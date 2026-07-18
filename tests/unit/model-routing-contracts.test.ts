import { describe, expect, it } from "vitest";
import {
  buildIdeaCandidateSystem,
  buildSelectedIdeaBrief,
} from "@/lib/creator/idea-assistant";
import { buildDirectionReviewSystem } from "@/lib/services/content-direction-review-service";

describe("model routing structured contracts", () => {
  it("provides the exact candidate shape to the idea model", () => {
    const prompt = buildIdeaCandidateSystem("zh-CN");
    for (const key of ["candidates", "title", "angle", "audience", "reason"]) {
      expect(prompt).toContain(`"${key}"`);
    }
    expect(prompt).toContain("Return exactly 3 candidates");
    expect(prompt).toContain("所有面向用户的字符串使用简体中文");
    expect(prompt).toContain("禁止项和硬边界");
  });

  it("keeps the original hard constraints after an idea is selected", () => {
    const brief = buildSelectedIdeaBrief({
      originalBrief: "写领养准备清单，不要引用未经确认的价格数据。",
      direction: "检查清单 + 新手入门",
      uiLocale: "zh-CN",
      candidate: {
        title: "领养前 7 天",
        angle: "每天一个可验证动作",
        audience: "第一次养猫的上班族",
        reason: "降低冲动领养风险",
      },
    });
    expect(brief).toContain("原始需求（所有约束继续生效）");
    expect(brief).toContain("不要引用未经确认的价格数据");
    expect(brief).toContain("选中的选题：领养前 7 天");
  });

  it("requires every supplied criterion during direction review", () => {
    for (const stage of ["generation", "publish"] as const) {
      const prompt = buildDirectionReviewSystem(stage);
      for (const key of ["summary", "criteria", "key", "score", "passed", "reason", "suggestions"]) {
        expect(prompt).toContain(`"${key}"`);
      }
      expect(prompt).toContain("every supplied criterion key exactly once");
    }
  });
});
