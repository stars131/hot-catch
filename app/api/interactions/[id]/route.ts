import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { resolvePendingInteraction } from "@/lib/services/interaction-service";

const schema = z.object({ resolution: z.unknown() });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(); const { id } = await params; const input = schema.parse(await request.json()); return ok({ interaction: await resolvePendingInteraction({ userId: user.id, interactionId: id, resolution: input.resolution as Prisma.InputJsonValue }) }); }
  catch (error) { return fail(error); }
}
