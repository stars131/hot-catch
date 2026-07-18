import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getAiToEarnConnectionStatus } from "@/lib/services/connection-service";

export const runtime = "nodejs";

/**
 * C9 连接状态查询:凭证缺失时不抛错,显式返回 connection: "not_configured";
 * 只读本地库,不调用真实供应商,不返回凭证原文。
 */
export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getAiToEarnConnectionStatus(user.id));
  } catch (error) {
    return fail(error);
  }
}
