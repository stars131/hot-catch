import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { listAccounts } from "@/lib/services/benchmark-service";
import { fetchAndSaveXhs } from "@/lib/xhs/xhs-fetch-service";
import { resolveInputSchema } from "@/lib/validators/xhs";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const accounts = await listAccounts(user.id);
    return ok({ accounts });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const input = resolveInputSchema.parse(body);
    const result = await fetchAndSaveXhs({ userId: user.id, input: input.input });
    return ok(result, result.status === "success" ? 201 : 200);
  } catch (error) {
    return fail(error);
  }
}
