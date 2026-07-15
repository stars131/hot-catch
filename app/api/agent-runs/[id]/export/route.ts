import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fail } from "@/lib/http";
import { isUiLocale } from "@/lib/platforms/registry";
import { createAgentRunExport } from "@/lib/services/export-service";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const cookieLocale = request.cookies.get("STARTRACE_UI_LOCALE")?.value;
    const uiLocale = isUiLocale(cookieLocale) ? cookieLocale : "zh-CN";
    const exported = await createAgentRunExport({ userId: user.id, runId: id, uiLocale });
    return new Response(exported.bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
