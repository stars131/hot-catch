import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleUserMessage } from "@/lib/creator/agent-service";
import {
  createCustomSkill,
  deleteCustomSkill,
  listSkillsForUser,
  resolveSelectedSkills,
  updateUserSkill,
} from "@/lib/services/skill-service";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userAId = "";
let userBId = "";
let conversationId = "";
let customSkillId = "";

beforeAll(async () => {
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `skill-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `skill-b-${runId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
  const conversation = await prisma.conversation.create({
    data: { userId: userAId, title: "Skill 测试会话" },
  });
  conversationId = conversation.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("Skill 设置与任务快照", () => {
  it("自定义 Skill 只对所属用户可见", async () => {
    const skill = await createCustomSkill(userAId, {
      name: "第一人称经验",
      description: "把方法写成亲历过程",
      instructions: "使用第一人称，从具体经历切入，再总结可复用方法。",
    });
    customSkillId = skill.id;

    expect((await listSkillsForUser(userAId)).some((item) => item.id === customSkillId)).toBe(true);
    expect((await listSkillsForUser(userBId)).some((item) => item.id === customSkillId)).toBe(false);
  });

  it("按用户选择顺序解析内置和自定义 Skill", async () => {
    const resolved = await resolveSelectedSkills(userAId, [
      "builtin.expand-hook",
      customSkillId,
    ]);
    expect(resolved.map((skill) => skill.id)).toEqual([
      "builtin.expand-hook",
      customSkillId,
    ]);
    expect(resolved[1].instructions).toContain("第一人称");
  });

  it("每条 AgentRun 保存 Skill 快照，并同步当前会话选择", async () => {
    const result = await handleUserMessage({
      userId: userAId,
      conversationId,
      text: "写一篇关于第一次独立做项目的内容",
      clientMessageId: `cm-skill-${runId}`,
      skillIds: ["builtin.expand-hook", customSkillId],
      replyBuilder: () => ({ text: "已记录。", cards: [] }),
    });
    const input = result.run?.input as {
      skillIds?: string[];
      skills?: Array<{ id: string; instructions: string }>;
    };
    expect(input.skillIds).toEqual(["builtin.expand-hook", customSkillId]);
    expect(input.skills?.[1].instructions).toContain("第一人称");

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { activeSkillIds: true },
    });
    expect(conversation.activeSkillIds).toEqual(["builtin.expand-hook", customSkillId]);
  });

  it("停用或删除 Skill 会从活动会话移除，但不会改写历史 AgentRun", async () => {
    await updateUserSkill(userAId, { id: customSkillId, enabled: false });
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { activeSkillIds: true },
    });
    expect(conversation.activeSkillIds).toEqual(["builtin.expand-hook"]);
    await expect(resolveSelectedSkills(userAId, [customSkillId])).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    await deleteCustomSkill(userAId, customSkillId);
    const historicalRun = await prisma.agentRun.findFirstOrThrow({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
    });
    expect(JSON.stringify(historicalRun.input)).toContain(customSkillId);
  });
});
