import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  getPublishRecord,
  syncPublishRecord,
} from "@/lib/services/publishing-service";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const refresh = new URL(request.url).searchParams.get("refresh") === "1";
    const record = refresh
      ? await syncPublishRecord(user.id, id)
      : await getPublishRecord(user.id, id);
    return ok({ record });
  } catch (error) {
    return fail(error);
  }
}
