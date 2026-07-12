import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { resolvePublishingProvider } from "@/lib/services/publishing-service";
import { signAssetSchema } from "@/lib/validators/publishing";

export const runtime = "nodejs";

/**
 * 素材直传签名：凭证未配置/失效时显式返回 connection_required（422）。
 * mock 模式返回 simulated 签名（不可解析域名），客户端跳过真实直传；
 * 任何模式都不返回 API Key 或凭证原文。
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = signAssetSchema.parse(await request.json());
    const { provider, mode } = await resolvePublishingProvider(user.id);
    return ok({ upload: await provider.signAssetUpload(input), providerMode: mode });
  } catch (error) {
    return fail(error);
  }
}
