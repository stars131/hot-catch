import { CredentialProvider } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { AppError, isAppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import {
  loadCredential,
  markCredentialInvalid,
  markCredentialValidated,
} from "@/lib/services/credential-service";
import { xDiscoveryInputSchema } from "@/lib/validators/x-discovery";
import { discoverX, type XDiscoveryPayload } from "@/lib/x/discovery";
import { discoverXPublic } from "@/lib/x/public-discovery";

export const runtime = "nodejs";

const OFFICIAL_CACHE_MS = 2 * 60 * 1000;
const PUBLIC_CACHE_MS = 5 * 60 * 1000;
const DISCOVERY_RATE_LIMIT = { limit: 20, windowSeconds: 60 } as const;
const cache = new Map<string, { expiresAt: number; payload: XDiscoveryPayload }>();

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = xDiscoveryInputSchema.parse(await request.json());
    const cacheKey = `${user.id}:${JSON.stringify(input)}`;
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return ok({ ...cached.payload, cached: true });
    }

    await enforceRateLimit({
      key: `x-discovery:${user.id}`,
      limit: DISCOVERY_RATE_LIMIT.limit,
      windowSeconds: DISCOVERY_RATE_LIMIT.windowSeconds,
    });

    const token = await loadOptionalXToken(user.id);
    let officialError: AppError | null = null;
    if (token && !(input.mode === "region" && input.regionQuery)) {
      try {
        const payload = await discoverX(input, token);
        cache.set(cacheKey, { expiresAt: Date.now() + OFFICIAL_CACHE_MS, payload });
        await markCredentialValidated(user.id, CredentialProvider.x_api);
        pruneCache();
        return ok({ ...payload, cached: false });
      } catch (error) {
        if (!isRecoverableOfficialError(error)) throw error;
        officialError = error;
        if (error.code === "CREDENTIAL_INVALID") {
          await markCredentialInvalid(user.id, CredentialProvider.x_api);
        }
      }
    }

    const payload = await discoverXPublic(input);
    if (officialError) {
      payload.warnings.unshift(officialFallbackWarning(officialError));
    }
    cache.set(cacheKey, { expiresAt: Date.now() + PUBLIC_CACHE_MS, payload });
    pruneCache();
    return ok({ ...payload, cached: false });
  } catch (error) {
    return fail(error);
  }
}

async function loadOptionalXToken(userId: string) {
  try {
    const credential = await loadCredential(userId, CredentialProvider.x_api);
    const token = credential.apiKey || credential.bearerToken;
    return token?.trim() || null;
  } catch (error) {
    if (
      isAppError(error) &&
      (error.code === "CREDENTIAL_NOT_CONFIGURED" || error.code === "CREDENTIAL_INVALID")
    ) {
      return null;
    }
    throw error;
  }
}

function isRecoverableOfficialError(error: unknown): error is AppError {
  return isAppError(error) && [
    "CREDENTIAL_INVALID",
    "CREDENTIAL_NOT_CONFIGURED",
    "RATE_LIMITED",
    "PROVIDER_ERROR",
    "DEPENDENCY_UNAVAILABLE",
  ].includes(error.code);
}

function officialFallbackWarning(error: AppError) {
  if (error.code === "CREDENTIAL_INVALID") {
    return "已配置的 X 官方凭证无效，本次自动改用无需凭证的公开 OSINT 数据源。";
  }
  if (error.code === "RATE_LIMITED") {
    return "X 官方接口已限速，本次自动改用无需凭证的公开 OSINT 数据源。";
  }
  return "X 官方接口本次不可用，已自动改用无需凭证的公开 OSINT 数据源。";
}

function pruneCache() {
  const now = Date.now();
  if (cache.size < 200) return;
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) cache.delete(key);
  }
}
