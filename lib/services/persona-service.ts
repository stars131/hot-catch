import { prisma } from "@/lib/prisma";
import type { PersonaInput } from "@/lib/validators/persona";
import type { Prisma } from "@prisma/client";

function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

export async function listPersonas(userId: string) {
  return prisma.persona.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getEffectivePersona(userId: string, personaId?: string | null) {
  if (personaId) {
    const persona = await prisma.persona.findFirst({ where: { id: personaId, userId } });
    if (persona) return persona;
  }

  return prisma.persona.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
}

export async function upsertPersona(userId: string, input: PersonaInput) {
  const { id, ...rest } = input;
  const data = compact(rest);

  if (data.isDefault) {
    await prisma.persona.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
  }

  if (id) {
    return prisma.persona.update({
      where: { id },
      data: data as Prisma.PersonaUpdateInput,
    });
  }

  return prisma.persona.create({
    data: {
      userId,
      name: data.name ?? "Default creator persona",
      ...data,
    } as Prisma.PersonaUncheckedCreateInput,
  });
}
