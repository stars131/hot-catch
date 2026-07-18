import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

type CredentialEnvelope = {
  version: 1;
  algorithm: typeof ALGORITHM;
  iv: string;
  authTag: string;
  ciphertext: string;
};

function decodeKey(rawKey: string): Buffer | null {
  const trimmed = rawKey.trim();
  if (!trimmed) return null;

  if (/^[a-f\d]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const decoded = Buffer.from(trimmed, "base64");
  return decoded.length === 32 ? decoded : null;
}

export function getCredentialEncryptionKey(rawKey = env.CREDENTIAL_ENCRYPTION_KEY) {
  const decoded = decodeKey(rawKey);
  if (decoded) return decoded;

  if (env.NODE_ENV !== "production" && !rawKey.trim()) {
    return createHash("sha256")
      .update(env.AUTH_SECRET || "startrace-local-development-only")
      .digest();
  }

  throw new AppError(
    "DEPENDENCY_UNAVAILABLE",
    "凭证加密密钥未配置或格式不正确。",
    503,
  );
}

export function encryptCredential(
  value: Record<string, string>,
  rawKey?: string,
): string {
  const key = getCredentialEncryptionKey(rawKey);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const envelope: CredentialEnvelope = {
    version: 1,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };

  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

export function decryptCredential(
  encryptedPayload: string,
  rawKey?: string,
): Record<string, string> {
  try {
    const key = getCredentialEncryptionKey(rawKey);
    const parsed = JSON.parse(
      Buffer.from(encryptedPayload, "base64url").toString("utf8"),
    ) as CredentialEnvelope;

    if (parsed.version !== 1 || parsed.algorithm !== ALGORITHM) {
      throw new Error("Unsupported credential envelope");
    }

    const decipher = createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(parsed.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(parsed.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(parsed.ciphertext, "base64")),
      decipher.final(),
    ]);
    const credential = JSON.parse(plaintext.toString("utf8"));

    if (!credential || typeof credential !== "object" || Array.isArray(credential)) {
      throw new Error("Invalid credential payload");
    }

    return credential as Record<string, string>;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("CREDENTIAL_INVALID", "凭证无法解密，请重新保存。", 422);
  }
}

export function credentialHint(value: Record<string, string>): string {
  const secret = Object.values(value).find((entry) => entry.trim().length > 0);
  if (!secret) return "已保存";
  const trimmed = secret.trim();
  return trimmed.length <= 4 ? "已保存" : `••••${trimmed.slice(-4)}`;
}
