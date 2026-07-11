import { CredentialProvider } from "@prisma/client";
import { isAppError } from "@/lib/errors";
import {
  deleteCredential,
  loadCredential,
  saveCredential,
} from "@/lib/services/credential-service";

export type UserHotspotCookieEntry = {
  cookie?: string;
  upstream?: string;
  updatedAt?: string;
};

export type UserHotspotCookieStore = Record<string, UserHotspotCookieEntry>;

export async function loadUserHotspotCookieStore(
  userId: string,
): Promise<UserHotspotCookieStore> {
  try {
    const credential = await loadCredential(userId, CredentialProvider.xiaohongshu_cookie);
    return credential.configJson ? parseStore(credential.configJson) : {};
  } catch (error) {
    if (isAppError(error) && error.code === "CREDENTIAL_NOT_CONFIGURED") return {};
    throw error;
  }
}

export async function saveUserHotspotCookieConfig(
  userId: string,
  code: string,
  config: { cookie?: string; upstream?: string },
) {
  const store = await loadUserHotspotCookieStore(userId);
  const cookie = config.cookie?.trim();
  const upstream = config.upstream?.trim();
  if (!cookie && !upstream) delete store[code];
  else {
    store[code] = {
      ...(cookie ? { cookie } : {}),
      ...(upstream ? { upstream } : {}),
      updatedAt: new Date().toISOString(),
    };
  }

  if (!Object.keys(store).length) {
    await deleteCredential(userId, CredentialProvider.xiaohongshu_cookie);
    return store;
  }
  await saveCredential(userId, CredentialProvider.xiaohongshu_cookie, {
    configJson: JSON.stringify(store),
  });
  return store;
}

export function clearUserHotspotCookieConfig(userId: string, code: string) {
  return saveUserHotspotCookieConfig(userId, code, {});
}

function parseStore(raw: string): UserHotspotCookieStore {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).flatMap(([code, entry]) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
        const record = entry as Record<string, unknown>;
        const cookie = typeof record.cookie === "string" ? record.cookie.trim() : "";
        const upstream = typeof record.upstream === "string" ? record.upstream.trim() : "";
        if (!cookie && !upstream) return [];
        return [[
          code,
          {
            ...(cookie ? { cookie } : {}),
            ...(upstream ? { upstream } : {}),
            ...(typeof record.updatedAt === "string" ? { updatedAt: record.updatedAt } : {}),
          },
        ]];
      }),
    );
  } catch {
    return {};
  }
}
