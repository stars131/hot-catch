import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { listPublishRecords } from "@/lib/services/publishing-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const requested = Number(new URL(request.url).searchParams.get("take") ?? 30);
    const take = Number.isFinite(requested) ? requested : 30;
    return ok({ records: await listPublishRecords(user.id, take) });
  } catch (error) {
    return fail(error);
  }
}
