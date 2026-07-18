import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2) return ok({ conversations: [], messages: [], contents: [], memories: [] });
    const [conversations, messages, contents, memories] = await Promise.all([
      prisma.conversation.findMany({ where: { userId: user.id, title: { contains: query, mode: "insensitive" } }, orderBy: { updatedAt: "desc" }, take: 30 }),
      prisma.message.findMany({ where: { conversation: { userId: user.id }, content: { contains: query, mode: "insensitive" } }, include: { conversation: { select: { title: true } } }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.generatedContent.findMany({ where: { userId: user.id, OR: [{ title: { contains: query, mode: "insensitive" } }, { bodyText: { contains: query, mode: "insensitive" } }, { fullMarkdown: { contains: query, mode: "insensitive" } }] }, orderBy: { updatedAt: "desc" }, take: 30 }),
      prisma.accountMemory.findMany({ where: { userId: user.id, OR: [{ title: { contains: query, mode: "insensitive" } }, { body: { contains: query, mode: "insensitive" } }] }, orderBy: { updatedAt: "desc" }, take: 30 }),
    ]);
    return ok({ conversations, messages, contents, memories });
  } catch (error) { return fail(error); }
}
