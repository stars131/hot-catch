import { CredentialProvider } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { isAppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { createLlmProviderFor } from "@/lib/providers/factory";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  markCredentialInvalid,
  markCredentialValidated,
} from "@/lib/services/credential-service";
import { setDefaultLlmProviderSchema } from "@/lib/validators/credentials";

export const runtime = "nodejs";

/** 付费自测限流:每用户每 5 分钟最多 10 次,防止把连接检查当免费额度刷。 */
const TEST_RATE_LIMIT = { limit: 10, windowSeconds: 300 } as const;

export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireUser>> | null = null;
  let input: ReturnType<typeof setDefaultLlmProviderSchema.parse> | null = null;
  try {
    user = await requireUser();
    input = setDefaultLlmProviderSchema.parse(await request.json());
    // 限流按用户 + 供应商隔离;生产环境 Redis 故障时 fail-closed。
    await enforceRateLimit({
      key: `model-test:${user.id}:${input.provider}`,
      limit: TEST_RATE_LIMIT.limit,
      windowSeconds: TEST_RATE_LIMIT.windowSeconds,
    });
    const provider = await createLlmProviderFor(user.id, input.provider);
    const reply = await provider.generateText({
      system: "你是模型连接检查器。",
      prompt: "只回复 OK。",
      temperature: 0,
    });
    await markCredentialValidated(
      user.id,
      input.provider as CredentialProvider,
    );
    return ok({
      connected: true,
      provider: provider.name,
      model: provider.model,
      reply: reply.slice(0, 40),
    });
  } catch (error) {
    if (
      user &&
      input &&
      isAppError(error) &&
      error.code === "CREDENTIAL_INVALID"
    ) {
      await markCredentialInvalid(
        user.id,
        input.provider as CredentialProvider,
      );
    }
    return fail(error);
  }
}
