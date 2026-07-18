import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { listTaskCenter, taskCenterAction } from "@/lib/services/task-center-service";

const actionSchema = z.object({ kind: z.enum(["run", "job", "queue"]), id: z.string().cuid(), action: z.enum(["cancel", "retry"]) });
export async function GET(request: Request) {
  try { const user = await requireUser(); const url = new URL(request.url); return ok(await listTaskCenter(user.id, url.searchParams.get("status") ?? undefined)); }
  catch (error) { return fail(error); }
}
export async function PATCH(request: Request) {
  try { const user = await requireUser(); const input = actionSchema.parse(await request.json()); return ok({ task: await taskCenterAction({ userId: user.id, ...input }) }); }
  catch (error) { return fail(error); }
}
