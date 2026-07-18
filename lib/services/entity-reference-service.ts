import type { EntityRef } from "@/lib/creator/chat-protocol";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function validateEntityReferences(userId: string, references: readonly EntityRef[]) {
  const unique = [...new Map(references.map((reference) => [`${reference.type}:${reference.id}`, reference])).values()];
  const checks = await Promise.all(unique.map(async (reference) => {
    switch (reference.type) {
      case "social_connection": return prisma.socialConnection.findFirst({ where: { id: reference.id, userId, archivedAt: null }, select: { id: true } });
      case "persona": return prisma.persona.findFirst({ where: { id: reference.id, userId }, select: { id: true } });
      case "idea": return prisma.idea.findFirst({ where: { id: reference.id, userId }, select: { id: true } });
      case "content": return prisma.generatedContent.findFirst({ where: { id: reference.id, userId }, select: { id: true } });
      case "content_revision": return prisma.contentRevision.findFirst({ where: { id: reference.id, userId }, select: { id: true } });
      case "style_profile": return prisma.creatorStyleProfile.findFirst({ where: { id: reference.id, userId }, select: { id: true } });
      case "benchmark_account": return prisma.benchmarkAccount.findFirst({ where: { id: reference.id, userId }, select: { id: true } });
      case "benchmark_note": return prisma.benchmarkNote.findFirst({ where: { id: reference.id, account: { userId } }, select: { id: true } });
    }
  }));
  if (checks.some((result) => !result)) throw new AppError("FORBIDDEN", "引用中包含无权访问或已失效的实体。", 403);
  return unique;
}
