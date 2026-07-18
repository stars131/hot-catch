import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  activatePersona,
  archivePersona,
  copyPersonaVersion,
  createPersonaVersion,
  listPersonas,
} from "@/lib/services/persona-service";
import { personaSchema, personaVersionActionSchema } from "@/lib/validators/persona";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const account = request.nextUrl.searchParams.get("socialConnectionId");
    return ok({ personas: await listPersonas(user.id, account === "global" ? null : account ?? undefined) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const persona = await createPersonaVersion(user.id, personaSchema.parse(await request.json()));
    return ok({ persona }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = personaVersionActionSchema.parse(await request.json());
    const persona = input.action === "activate"
      ? await activatePersona(user.id, input.personaId)
      : input.action === "archive"
        ? await archivePersona(user.id, input.personaId)
        : await copyPersonaVersion(user.id, input.personaId, input.socialConnectionId);
    return ok({ persona });
  } catch (error) {
    return fail(error);
  }
}
