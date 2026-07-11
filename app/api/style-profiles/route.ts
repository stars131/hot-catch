import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { listStyleProfiles } from "@/lib/services/style-profile-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ styleProfiles: await listStyleProfiles(user.id) });
  } catch (error) {
    return fail(error);
  }
}
