import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  deleteTrackedPublication,
  setTrackingPaused,
} from "@/lib/tracking/tracking-service";

const updateSchema = z.object({ paused: z.boolean() }).strict();

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = updateSchema.parse(await request.json());
    return ok({ publication: await setTrackingPaused(user.id, id, input.paused) });
  } catch (error) {
    return fail(error);
  }
}
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await deleteTrackedPublication(user.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
