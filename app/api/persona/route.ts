import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { personaSchema } from "@/lib/validators/persona";
import { listPersonas, upsertPersona } from "@/lib/services/persona-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const personas = await listPersonas(user.id);
    return ok({ personas });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const input = personaSchema.parse(body);
    const persona = await upsertPersona(user.id, input);
    return ok({ personaId: persona.id, persona });
  } catch (error) {
    return fail(error);
  }
}
