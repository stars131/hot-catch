import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  createManualSocialConnection,
  listSocialConnections,
  updateSocialConnection,
} from "@/lib/services/social-connection-service";
import {
  createManualConnectionSchema,
  updateConnectionSchema,
} from "@/lib/validators/social-connections";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    return ok({
      connections: await listSocialConnections(
        user.id,
        request.nextUrl.searchParams.get("archived") === "true",
      ),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const connection = await createManualSocialConnection(
      user.id,
      createManualConnectionSchema.parse(await request.json()),
    );
    return ok({ connection }, 201);
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const connection = await updateSocialConnection(
      user.id,
      updateConnectionSchema.parse(await request.json()),
    );
    return ok({ connection });
  } catch (error) {
    return fail(error);
  }
}
