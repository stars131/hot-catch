import { Prisma, type Persona } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { PersonaInput } from "@/lib/validators/persona";

function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

export async function listPersonas(userId: string, socialConnectionId?: string | null) {
  return prisma.persona.findMany({
    where: {
      userId,
      ...(socialConnectionId === undefined ? {} : { socialConnectionId }),
    },
    include: { socialConnection: true },
    orderBy: [
      { isDefault: "desc" },
      { status: "asc" },
      { version: "desc" },
      { updatedAt: "desc" },
    ],
  });
}

export async function getEffectivePersona(
  userId: string,
  personaId?: string | null,
  socialConnectionId?: string | null,
) {
  if (personaId) {
    const persona = await prisma.persona.findFirst({ where: { id: personaId, userId } });
    if (persona) return persona;
  }

  if (socialConnectionId) {
    const accountPersona = await prisma.persona.findFirst({
      where: { userId, socialConnectionId, status: "active" },
      orderBy: { version: "desc" },
    });
    if (accountPersona) return accountPersona;
  }

  return prisma.persona.findFirst({
    where: { userId, socialConnectionId: null, status: "active" },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
}

/** Legacy adapter. Existing callers may still update a row in place. */
export async function upsertPersona(userId: string, input: PersonaInput) {
  if (!input.id) return createPersonaVersion(userId, input);
  const existing = await prisma.persona.findFirst({ where: { id: input.id, userId } });
  if (!existing) throw new AppError("NOT_FOUND", "人设不存在。", 404);
  const data = compact(omitKeys(input, ["id"]));
  if (data.socialConnectionId) await assertConnectionOwned(userId, data.socialConnectionId);
  if (data.isDefault) await clearGlobalDefault(userId, existing.id);
  return prisma.persona.update({
    where: { id: existing.id },
    data: data as Prisma.PersonaUncheckedUpdateInput,
  });
}

export async function createPersonaVersion(userId: string, input: PersonaInput) {
  if (input.socialConnectionId) await assertConnectionOwned(userId, input.socialConnectionId);
  const previous = input.previousVersionId
    ? await prisma.persona.findFirst({ where: { id: input.previousVersionId, userId } })
    : null;
  if (input.previousVersionId && !previous) {
    throw new AppError("NOT_FOUND", "前一版人设不存在。", 404);
  }
  const socialConnectionId = input.socialConnectionId ?? previous?.socialConnectionId ?? null;
  const latest = await prisma.persona.aggregate({
    where: { userId, socialConnectionId },
    _max: { version: true },
  });
  const data = compact(omitKeys(input, ["id"]));
  const requestedStatus = input.status ?? (socialConnectionId ? "draft" : "active");

  return prisma.$transaction(async (tx) => {
    if (requestedStatus === "active") {
      await tx.persona.updateMany({
        where: { userId, socialConnectionId, status: "active" },
        data: { status: "archived" },
      });
    }
    if (input.isDefault) {
      await tx.persona.updateMany({
        where: { userId, socialConnectionId: null },
        data: { isDefault: false },
      });
    }
    return tx.persona.create({
      data: {
        ...(data as Prisma.PersonaUncheckedCreateInput),
        userId,
        name: input.name ?? previous?.name ?? "默认创作者人设",
        socialConnectionId,
        previousVersionId: previous?.id ?? null,
        version: (latest._max.version ?? 0) + 1,
        status: requestedStatus,
        activatedAt: requestedStatus === "active" ? new Date() : null,
      },
    });
  });
}

export async function activatePersona(userId: string, personaId: string) {
  const persona = await prisma.persona.findFirst({ where: { id: personaId, userId } });
  if (!persona) throw new AppError("NOT_FOUND", "人设不存在。", 404);
  return prisma.$transaction(async (tx) => {
    await tx.persona.updateMany({
      where: {
        userId,
        socialConnectionId: persona.socialConnectionId,
        status: "active",
        id: { not: persona.id },
      },
      data: { status: "archived" },
    });
    if (!persona.socialConnectionId) {
      await tx.persona.updateMany({
        where: { userId, socialConnectionId: null },
        data: { isDefault: false },
      });
    }
    return tx.persona.update({
      where: { id: persona.id },
      data: {
        status: "active",
        activatedAt: new Date(),
        isDefault: persona.socialConnectionId ? persona.isDefault : true,
      },
    });
  });
}

export async function archivePersona(userId: string, personaId: string) {
  const persona = await prisma.persona.findFirst({ where: { id: personaId, userId } });
  if (!persona) throw new AppError("NOT_FOUND", "人设不存在。", 404);
  return prisma.persona.update({
    where: { id: persona.id },
    data: { status: "archived", isDefault: false },
  });
}

export async function copyPersonaVersion(
  userId: string,
  personaId: string,
  socialConnectionId?: string | null,
) {
  const source = await prisma.persona.findFirst({ where: { id: personaId, userId } });
  if (!source) throw new AppError("NOT_FOUND", "人设不存在。", 404);
  return createPersonaVersion(userId, {
    ...personaFields(source),
    name: `${source.name ?? "人设"} 副本`,
    socialConnectionId: socialConnectionId === undefined ? source.socialConnectionId : socialConnectionId,
    previousVersionId: source.id,
    status: "draft",
    source: "manual",
    isDefault: false,
  });
}

function personaFields(persona: Persona): PersonaInput {
  return omitKeys(persona, [
    "id", "userId", "socialConnectionId", "version", "status", "source",
    "previousVersionId", "activatedAt", "createdAt", "updatedAt",
  ]) as PersonaInput;
}

function omitKeys<T extends object>(value: T, keys: readonly string[]) {
  const omitted = new Set(keys);
  return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)));
}

async function assertConnectionOwned(userId: string, socialConnectionId: string) {
  const connection = await prisma.socialConnection.findFirst({
    where: { id: socialConnectionId, userId, archivedAt: null },
    select: { id: true },
  });
  if (!connection) throw new AppError("NOT_FOUND", "目标账号不存在。", 404);
}

async function clearGlobalDefault(userId: string, excludeId: string) {
  await prisma.persona.updateMany({
    where: { userId, socialConnectionId: null, id: { not: excludeId } },
    data: { isDefault: false },
  });
}
