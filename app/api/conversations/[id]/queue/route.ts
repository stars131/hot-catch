import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { enqueueTurn, listQueuedTurns, updateQueuedTurn } from "@/lib/services/queue-service";

const createSchema = z.object({ clientTurnId: z.string().min(1).max(100), content: z.string().trim().min(1).max(12000), parts: z.unknown().optional(), context: z.unknown().optional(), policy: z.enum(["append", "interrupt"]).default("append") });
const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), turnId: z.string().cuid(), content: z.string().trim().min(1).max(12000) }),
  z.object({ action: z.literal("move"), turnId: z.string().cuid(), position: z.number().int().positive() }),
  z.object({ action: z.literal("cancel"), turnId: z.string().cuid() }),
]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(); const { id } = await params; return ok({ turns: await listQueuedTurns(user.id, id) }); }
  catch (error) { return fail(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(); const { id } = await params; const input = createSchema.parse(await request.json()); return ok({ turn: await enqueueTurn({ userId: user.id, conversationId: id, ...input, parts: input.parts as Prisma.InputJsonValue, context: input.context as Prisma.InputJsonValue }) }, 201); }
  catch (error) { return fail(error); }
}
export async function PATCH(request: Request) {
  try { const user = await requireUser(); const input = updateSchema.parse(await request.json()); return ok({ turn: await updateQueuedTurn({ userId: user.id, ...input }) }); }
  catch (error) { return fail(error); }
}
