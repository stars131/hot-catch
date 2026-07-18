import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; referenceId: string }> },
) {
  try {
    const user = await requireUser();
    const { id, referenceId } = await params;
    const reference = await prisma.contentReference.findFirst({
      where: { id: referenceId, contentId: id, userId: user.id },
      select: { id: true },
    });
    if (!reference) {
      throw new AppError("NOT_FOUND", "参考资料不存在或不属于当前账号。", 404);
    }
    await prisma.contentReference.delete({ where: { id: reference.id } });
    return ok({ deleted: true });
  } catch (error) {
    return fail(error);
  }
}
