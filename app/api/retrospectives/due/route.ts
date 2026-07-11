import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { listDueRetrospectives } from "@/lib/services/performance-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ retrospectives: await listDueRetrospectives(user.id) });
  } catch (error) {
    return fail(error);
  }
}
