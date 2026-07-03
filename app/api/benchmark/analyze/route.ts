import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { analyzeSchema } from "@/lib/validators/content";
import { analyzeAccounts } from "@/lib/services/analysis-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const input = analyzeSchema.parse(body);
    const result = await analyzeAccounts({
      userId: user.id,
      accountIds: input.accountIds,
      personaId: input.personaId,
      analysisType: input.analysisType,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
