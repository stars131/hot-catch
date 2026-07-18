import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { listSkillsForUser } from "@/lib/services/skill-service";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    const prefix = url.searchParams.get("prefix") === "$" ? "$" : "@";
    if (prefix === "$") {
      const skills = await listSkillsForUser(user.id);
      return ok({ items: skills.filter((skill) => skill.enabled && (!query || skill.name.toLowerCase().includes(query.toLowerCase()))).slice(0, 12).map((skill) => ({ kind: "skill", id: skill.id, label: skill.name, description: skill.description })) });
    }
    const contains = query ? { contains: query, mode: "insensitive" as const } : undefined;
    const [accounts, personas, ideas, contents, references] = await Promise.all([
      prisma.socialConnection.findMany({ where: { userId: user.id, archivedAt: null, ...(contains ? { displayName: contains } : {}) }, take: 8, orderBy: { updatedAt: "desc" } }),
      prisma.persona.findMany({ where: { userId: user.id, status: { not: "archived" }, ...(contains ? { name: contains } : {}) }, take: 8, orderBy: { updatedAt: "desc" } }),
      prisma.idea.findMany({ where: { userId: user.id, ...(contains ? { title: contains } : {}) }, take: 8, orderBy: { updatedAt: "desc" } }),
      prisma.generatedContent.findMany({ where: { userId: user.id, ...(contains ? { title: contains } : {}) }, take: 8, orderBy: { updatedAt: "desc" } }),
      prisma.benchmarkNote.findMany({ where: { account: { userId: user.id }, ...(contains ? { title: contains } : {}) }, take: 8, orderBy: { updatedAt: "desc" } }),
    ]);
    return ok({ items: [
      ...accounts.map((item) => ({ kind: "account", entityType: "social_connection", id: item.id, label: item.displayName || item.handle || item.externalAccountId, description: item.platform })),
      ...personas.map((item) => ({ kind: "persona", entityType: "persona", id: item.id, label: item.name || "未命名人设", description: `v${item.version} · ${item.status}` })),
      ...ideas.map((item) => ({ kind: "idea", entityType: "idea", id: item.id, label: item.title, description: item.angle })),
      ...contents.map((item) => ({ kind: "content", entityType: "content", id: item.id, label: item.title || "未命名作品", description: item.platform })),
      ...references.map((item) => ({ kind: "reference", entityType: "benchmark_note", id: item.id, label: item.title || item.noteId || "参考内容", description: item.noteUrl })),
    ].slice(0, 20) });
  } catch (error) { return fail(error); }
}
