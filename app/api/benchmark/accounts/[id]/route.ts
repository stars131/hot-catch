import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  deleteAccount,
  getAccount,
  updateAccountMeta,
} from "@/lib/services/benchmark-service";
import { AppError } from "@/lib/errors";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const account = await getAccount(user.id, id);
    if (!account) throw new AppError("NOT_FOUND", "Benchmark account not found.", 404);
    return ok({ account });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const account = await updateAccountMeta(user.id, id, {
      userRemark: typeof body?.userRemark === "string" ? body.userRemark : undefined,
      isFavorite: typeof body?.isFavorite === "boolean" ? body.isFavorite : undefined,
      groupName: typeof body?.groupName === "string" ? body.groupName : undefined,
    });
    return ok({ account });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await deleteAccount(user.id, id);
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
