import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  deleteCredential,
  listCredentialSummaries,
  saveCredential,
} from "@/lib/services/credential-service";
import {
  credentialProviderSchema,
  saveCredentialSchema,
} from "@/lib/validators/credentials";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ credentials: await listCredentialSummaries(user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = saveCredentialSchema.parse(await request.json());
    const credential = await saveCredential(user.id, input.provider, input.value);
    return ok({ credential });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const provider = credentialProviderSchema.parse(
      request.nextUrl.searchParams.get("provider"),
    );
    await deleteCredential(user.id, provider);
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
