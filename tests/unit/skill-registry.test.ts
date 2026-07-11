import { describe, expect, it } from "vitest";
import {
  DEFAULT_PATCH_SKILL_ID,
  GRANTED_BUILTIN_CAPABILITIES,
  REMOTE_SKILL_FIXTURE,
  executeBuiltinSkill,
  executeRemoteSkill,
  getSkillManifest,
  listSkillManifests,
  listSkillMenuItems,
  matchSkillByInstruction,
  type BuiltinSkillInput,
} from "@/lib/creator/skill-registry";
import { assertCapabilitiesAllowed, skillManifestSchema } from "@/lib/creator/skill-protocol";

const baseInput: BuiltinSkillInput = {
  instruction: "请改写这一段",
  sectionLabel: "第 2 页",
  before: "其实这一段写得有点啰嗦,然后重复了两次同样的意思。",
  contentKind: "xhs_graphic",
};

function proposalAfterOf(result: { proposedEffects?: Array<{ type: string }> }): string {
  const effect = result.proposedEffects?.[0];
  if (!effect || effect.type !== "content.propose_revision") {
    throw new Error("没有 content.propose_revision 提案");
  }
  return ((effect as unknown as { payload: { after: string } }).payload ?? { after: "" })
    .after;
}

describe("内置 Skill Registry", () => {
  it("所有内置 manifest 都通过 star-skill/v1 校验且为 builtin 执行", () => {
    const manifests = listSkillManifests();
    expect(manifests.length).toBeGreaterThanOrEqual(5);
    for (const manifest of manifests) {
      expect(() => skillManifestSchema.parse(manifest)).not.toThrow();
      expect(manifest.execution).toEqual({ type: "builtin" });
    }
  });

  it("技能菜单只暴露展示字段,不暴露执行体", () => {
    for (const item of listSkillMenuItems()) {
      expect(Object.keys(item).sort()).toEqual([
        "composerTemplate",
        "description",
        "id",
        "name",
      ]);
      expect(getSkillManifest(item.id)).not.toBeNull();
    }
  });

  it("按 triggers 匹配指令,未命中回退到通用改写", () => {
    expect(matchSkillByInstruction("帮我压缩这段,太长了")).toBe("builtin.compress-text");
    expect(matchSkillByInstruction("开头不够抓人")).toBe("builtin.expand-hook");
    expect(matchSkillByInstruction("检查一下有没有违禁词")).toBe("builtin.risk-check");
    expect(matchSkillByInstruction("随便看看")).toBe(DEFAULT_PATCH_SKILL_ID);
  });

  it("改写类技能返回 content.propose_revision 提案", () => {
    const result = executeBuiltinSkill("builtin.compress-text", baseInput);
    expect(result.status).toBe("completed");
    expect(result.proposedEffects?.[0]?.type).toBe("content.propose_revision");
    const after = proposalAfterOf(result);
    expect(after).not.toContain("其实");
    expect(after.length).toBeLessThan(baseInput.before.length);
  });

  it("指令中的「」引号内容作为改写结果直接采用(确定性)", () => {
    const result = executeBuiltinSkill("builtin.rewrite-section", {
      ...baseInput,
      instruction: "把这句换成「直接说结论,别绕弯子」",
    });
    expect(proposalAfterOf(result)).toBe("直接说结论,别绕弯子");
  });

  it("风险检查只返回说明文本,不提出修改", () => {
    const result = executeBuiltinSkill("builtin.risk-check", {
      ...baseInput,
      before: "全网最有效的方法,绝对治愈拖延",
    });
    expect(result.proposedEffects).toBeUndefined();
    expect(result.text).toContain("绝对");
    expect(result.text).toContain("协议预览");
  });

  it("同样输入得到同样输出(本地规则是确定性的)", () => {
    const a = executeBuiltinSkill("builtin.expand-hook", baseInput);
    const b = executeBuiltinSkill("builtin.expand-hook", baseInput);
    expect(a).toEqual(b);
  });
});

describe("Skill 安全边界", () => {
  it("不在注册表中的 Skill 被拒绝", () => {
    expect(() => executeBuiltinSkill("builtin.not-exists", baseInput)).toThrow(/不在内置注册表/);
  });

  it("能力越权的 manifest 被拒绝", () => {
    const manifest = skillManifestSchema.parse({
      ...listSkillManifests()[0],
      id: "builtin.evil",
      requiredCapabilities: ["job.request"],
    });
    expect(() => assertCapabilitiesAllowed(manifest, GRANTED_BUILTIN_CAPABILITIES)).toThrow(
      /未授权能力/,
    );
  });

  it("远程 Skill fixture 通过 manifest 校验但执行被禁用", () => {
    expect(() => skillManifestSchema.parse(REMOTE_SKILL_FIXTURE)).not.toThrow();
    expect(REMOTE_SKILL_FIXTURE.execution.type).toBe("remote");
    expect(() => executeRemoteSkill(REMOTE_SKILL_FIXTURE)).toThrow(/禁用/);
    // fixture 不进入技能菜单
    expect(
      listSkillMenuItems().some((item) => item.id === REMOTE_SKILL_FIXTURE.id),
    ).toBe(false);
  });

  it("超大输入不会产生超过协议上限的提案文本", () => {
    const result = executeBuiltinSkill("builtin.compress-text", {
      ...baseInput,
      before: "其实这句话很长。然后又重复一遍。".repeat(600),
    });
    expect(proposalAfterOf(result).length).toBeLessThanOrEqual(20000);
  });

  it("无规则可用时改写技能如实说明,不生成假提案", () => {
    const result = executeBuiltinSkill("builtin.rewrite-section", {
      ...baseInput,
      instruction: "请修改完整正文中选中的这段:「已经很干净的句子」,",
      before: "已经很干净的句子",
    });
    expect(result.proposedEffects).toBeUndefined();
    expect(result.text).toContain("没法直接改写");
  });
});
