import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  deleteCredential,
  getDefaultLlmProvider,
  listCredentialSummaries,
  saveCredential,
  setDefaultLlmProvider,
} from "@/lib/services/credential-service";
import {
  credentialProviderSchema,
  saveCredentialSchema,
  setDefaultLlmProviderSchema,
} from "@/lib/validators/credentials";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const [credentials, defaultLlmProvider] = await Promise.all([
      listCredentialSummaries(user.id),
      getDefaultLlmProvider(user.id),
    ]);
    return ok({ credentials, defaultLlmProvider });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = setDefaultLlmProviderSchema.parse(await request.json());
    const defaultLlmProvider = await setDefaultLlmProvider(
      user.id,
      input.provider,
    );
    return ok({ defaultLlmProvider });
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
