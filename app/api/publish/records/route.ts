import { requireUser } from "@/lib/auth";
import { resolvePublishProviderMode } from "@/lib/env";
import { fail, ok } from "@/lib/http";
import { listPublishRecords } from "@/lib/services/publishing-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const requested = Number(new URL(request.url).searchParams.get("take") ?? 30);
    const take = Number.isFinite(requested) ? requested : 30;
    return ok({
      records: await listPublishRecords(user.id, take),
      // UI 依据该字段显示"本地模拟模式"提示，绝不把模拟执行伪装成真实发布
      providerMode: resolvePublishProviderMode(),
    });
  } catch (error) {
    return fail(error);
  }
}
