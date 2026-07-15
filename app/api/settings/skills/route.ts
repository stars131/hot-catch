import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  createCustomSkill,
  deleteCustomSkill,
  listSkillsForUser,
  updateUserSkill,
} from "@/lib/services/skill-service";
import {
  createSkillSchema,
  skillExternalIdSchema,
  updateSkillSchema,
} from "@/lib/validators/skills";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ skills: await listSkillsForUser(user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = createSkillSchema.parse(await request.json());
    return ok({ skill: await createCustomSkill(user.id, input) }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = updateSkillSchema.parse(await request.json());
    return ok({ skill: await updateUserSkill(user.id, input) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const id = skillExternalIdSchema.parse(request.nextUrl.searchParams.get("id"));
    await deleteCustomSkill(user.id, id);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
