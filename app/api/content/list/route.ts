import { requireUser } from "@/lib/auth";
import { listContents } from "@/lib/services/content-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const contents = await listContents(user.id);
    return ok({ contents });
  } catch (error) {
    return fail(error);
  }
}
