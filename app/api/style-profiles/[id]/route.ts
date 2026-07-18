import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  getStyleProfile,
  updateStyleProfile,
} from "@/lib/services/style-profile-service";
import { updateStyleProfileSchema } from "@/lib/validators/style-profile";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    return ok({ styleProfile: await getStyleProfile(user.id, id) });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = updateStyleProfileSchema.parse(await request.json());
    return ok({ styleProfile: await updateStyleProfile(user.id, id, input) });
  } catch (error) {
    return fail(error);
  }
}
