import { Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import {
  buildSelectedSkillInstruction,
  customSkillDatabaseId,
  customSkillExternalId,
  isBuiltinSkillId,
  listBuiltinSkillCatalog,
  type SkillCatalogItem,
  type SkillScope,
  type SkillSnapshot,
} from "@/lib/skills/catalog";
import type { CreateSkillInput, UpdateSkillInput } from "@/lib/validators/skills";

const MAX_CUSTOM_SKILLS = 50;

export async function listSkillsForUser(userId: string): Promise<SkillCatalogItem[]> {
  const [user, customSkills] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { disabledSkillIds: true },
    }),
    prisma.userSkill.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    }),
  ]);
  if (!user) throw new AppError("NOT_FOUND", "用户不存在。", 404);

  const builtin = listBuiltinSkillCatalog(user.disabledSkillIds);
  const custom: SkillCatalogItem[] = customSkills.map((skill) => ({
    id: customSkillExternalId(skill.id),
    name: skill.name,
    description: skill.description,
    source: "custom",
    scopes: ["generation"],
    enabled: skill.enabled,
    instructions: skill.instructions,
    composerTemplate: null,
    updatedAt: skill.updatedAt.toISOString(),
  }));
  return [...builtin, ...custom];
}

export async function createCustomSkill(userId: string, input: CreateSkillInput) {
  const count = await prisma.userSkill.count({ where: { userId } });
  if (count >= MAX_CUSTOM_SKILLS) {
    throw new AppError("VALIDATION_ERROR", `最多创建 ${MAX_CUSTOM_SKILLS} 个自定义 Skill。`, 400);
  }
  const skill = await prisma.userSkill.create({ data: { userId, ...input } });
  return toCustomCatalogItem(skill);
}

export async function updateUserSkill(userId: string, input: UpdateSkillInput) {
  if (isBuiltinSkillId(input.id)) {
    if (input.enabled === undefined || input.name || input.description || input.instructions) {
      throw new AppError("VALIDATION_ERROR", "内置 Skill 只允许启用或停用。", 400);
    }
    const builtin = listBuiltinSkillCatalog().find((skill) => skill.id === input.id);
    if (!builtin) throw new AppError("NOT_FOUND", "内置 Skill 不存在。", 404);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { disabledSkillIds: true },
    });
    if (!user) throw new AppError("NOT_FOUND", "用户不存在。", 404);
    const disabled = new Set(user.disabledSkillIds);
    if (input.enabled) disabled.delete(input.id);
    else disabled.add(input.id);
    await prisma.user.update({
      where: { id: userId },
      data: { disabledSkillIds: [...disabled] },
    });
    if (!input.enabled) await removeSkillFromActiveConversations(userId, input.id);
    return { ...builtin, enabled: input.enabled };
  }

  const databaseId = customSkillDatabaseId(input.id);
  if (!databaseId) throw new AppError("VALIDATION_ERROR", "Skill ID 无效。", 400);
  const existing = await prisma.userSkill.findFirst({ where: { id: databaseId, userId } });
  if (!existing) throw new AppError("NOT_FOUND", "Skill 不存在或不属于当前用户。", 404);
  const updated = await prisma.userSkill.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });
  if (input.enabled === false) {
    await removeSkillFromActiveConversations(userId, input.id);
  }
  return toCustomCatalogItem(updated);
}

export async function deleteCustomSkill(userId: string, skillId: string) {
  const databaseId = customSkillDatabaseId(skillId);
  if (!databaseId) throw new AppError("VALIDATION_ERROR", "内置 Skill 不能删除。", 400);
  const existing = await prisma.userSkill.findFirst({ where: { id: databaseId, userId } });
  if (!existing) throw new AppError("NOT_FOUND", "Skill 不存在或不属于当前用户。", 404);
  await removeSkillFromActiveConversations(userId, skillId);
  await prisma.userSkill.delete({ where: { id: existing.id } });
}

export async function resolveSelectedSkills(
  userId: string,
  skillIds: readonly string[],
  scope: SkillScope = "generation",
): Promise<SkillSnapshot[]> {
  const uniqueIds = [...new Set(skillIds)];
  if (uniqueIds.length > 8) {
    throw new AppError("VALIDATION_ERROR", "一次创作最多选择 8 个 Skill。", 400);
  }
  if (!uniqueIds.length) return [];
  const catalog = await listSkillsForUser(userId);
  const byId = new Map(catalog.map((skill) => [skill.id, skill]));
  return uniqueIds.map((id) => {
    const skill = byId.get(id);
    if (!skill || !skill.enabled || !skill.scopes.includes(scope)) {
      throw new AppError("VALIDATION_ERROR", `Skill ${id} 不存在、已停用或不适用于当前操作。`, 400);
    }
    if (scope === "generation" && !skill.instructions) {
      throw new AppError("VALIDATION_ERROR", `Skill ${id} 没有创作说明。`, 400);
    }
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      source: skill.source,
      instructions: skill.instructions,
      version: skill.updatedAt ?? "builtin-v1",
    };
  });
}

export async function resolveConversationSkills(params: {
  userId: string;
  conversationId?: string | null;
  skillIds?: readonly string[];
}) {
  let skillIds = params.skillIds ? [...params.skillIds] : null;
  if (skillIds === null && params.conversationId) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: params.conversationId, userId: params.userId },
      select: { activeSkillIds: true },
    });
    skillIds = conversation?.activeSkillIds ?? [];
  }
  const snapshots = await resolveSelectedSkills(params.userId, skillIds ?? []);
  return {
    ids: snapshots.map((skill) => skill.id),
    snapshots,
    promptInstruction: buildSelectedSkillInstruction(snapshots),
  };
}

function toCustomCatalogItem(skill: {
  id: string;
  name: string;
  description: string;
  instructions: string;
  enabled: boolean;
  updatedAt: Date;
}): SkillCatalogItem {
  return {
    id: customSkillExternalId(skill.id),
    name: skill.name,
    description: skill.description,
    source: "custom",
    scopes: ["generation"],
    enabled: skill.enabled,
    instructions: skill.instructions,
    composerTemplate: null,
    updatedAt: skill.updatedAt.toISOString(),
  };
}

export function skillSnapshotsJson(skills: readonly SkillSnapshot[]): Prisma.InputJsonValue {
  return skills as unknown as Prisma.InputJsonValue;
}

async function removeSkillFromActiveConversations(userId: string, skillId: string) {
  const conversations = await prisma.conversation.findMany({
    where: { userId, activeSkillIds: { has: skillId } },
    select: { id: true, activeSkillIds: true },
  });
  if (!conversations.length) return;
  await prisma.$transaction(
    conversations.map((conversation) =>
      prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          activeSkillIds: conversation.activeSkillIds.filter((id) => id !== skillId),
        },
      }),
    ),
  );
}
