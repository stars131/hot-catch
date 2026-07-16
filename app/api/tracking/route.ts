import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  createTrackedPublication,
  listTrackedPublications,
} from "@/lib/tracking/tracking-service";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ publications: await listTrackedPublications(user.id) });
  } catch (error) {
    return fail(error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const result = await createTrackedPublication(user.id, await request.json());
    return ok(result, result.created ? 201 : 200);
  } catch (error) {
    return fail(error);
  }
}
