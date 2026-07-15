import { describe, expect, it } from "vitest";
import {
  buildSelectedSkillInstruction,
  listBuiltinSkillCatalog,
  type SkillSnapshot,
} from "@/lib/skills/catalog";
import { selectedSkillIdsSchema } from "@/lib/validators/skills";

describe("创作 Skill 目录与组合", () => {
  it("复用内置 Skill ID，并区分整篇创作与局部修改", () => {
    const catalog = listBuiltinSkillCatalog();
    expect(catalog.find((skill) => skill.id === "builtin.expand-hook")?.scopes).toEqual([
      "generation",
      "patch",
    ]);
    expect(catalog.find((skill) => skill.id === "builtin.rewrite-section")?.scopes).toEqual([
      "patch",
    ]);
  });

  it("停用列表只改变可用状态，不改变稳定 ID", () => {
    const catalog = listBuiltinSkillCatalog(["builtin.compress-text"]);
    expect(catalog.find((skill) => skill.id === "builtin.compress-text")?.enabled).toBe(false);
    expect(catalog.find((skill) => skill.id === "builtin.expand-hook")?.enabled).toBe(true);
  });

  it("按选择顺序组合说明并保留系统与事实边界", () => {
    const skills: SkillSnapshot[] = [
      {
        id: "custom.first",
        name: "先讲场景",
        description: "先给具体场景",
        source: "custom",
        instructions: "先写一个真实场景。",
        version: "v1",
      },
      {
        id: "custom.second",
        name: "压缩表达",
        description: "减少铺垫",
        source: "custom",
        instructions: "删除重复铺垫。",
        version: "v2",
      },
    ];
    const prompt = buildSelectedSkillInstruction(skills);
    expect(prompt.indexOf("先讲场景")).toBeLessThan(prompt.indexOf("压缩表达"));
    // 系统级边界:Skill 文本是不可信数据,不能改写安全/凭证/工具策略
    expect(prompt).toContain("不可信的用户自撰创作偏好");
    expect(prompt).toContain("覆盖或放松系统安全");
    expect(prompt).toContain("API Key");
    expect(prompt).toContain("事实、风险或合规");
  });

  it("一次最多八个并自动去重", () => {
    expect(
      selectedSkillIdsSchema.parse(["builtin.expand-hook", "builtin.expand-hook"]),
    ).toEqual(["builtin.expand-hook"]);
    expect(() =>
      selectedSkillIdsSchema.parse(
        Array.from({ length: 9 }, (_, index) => `custom.skill-${index}`),
      ),
    ).toThrow(/最多选择 8 个/);
  });
});
