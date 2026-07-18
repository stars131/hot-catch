import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { contentPublishSettingsSchema } from "@/lib/editor/publish-settings";
import {
  getContentPublishSettings,
  saveContentPublishSettings,
} from "@/lib/services/content-publish-settings-service";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await getContentPublishSettings(user.id, id));
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = contentPublishSettingsSchema.parse(await request.json());
    return ok(await saveContentPublishSettings(user.id, id, input));
  } catch (error) {
    return fail(error);
  }
}
