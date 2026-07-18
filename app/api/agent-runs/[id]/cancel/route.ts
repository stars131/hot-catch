import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { cancelAgentRun } from "@/lib/creator/agent-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const run = await cancelAgentRun(user.id, id);
    return ok({ run });
  } catch (error) {
    return fail(error);
  }
}
