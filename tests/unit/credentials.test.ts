import { describe, expect, it } from "vitest";
import {
  credentialHint,
  decryptCredential,
  encryptCredential,
} from "@/lib/security/credentials";

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

describe("credential encryption", () => {
  it("round-trips a structured credential without exposing plaintext", () => {
    const value = { apiKey: "sk-secret-value", workspaceId: "workspace-1" };
    const encrypted = encryptCredential(value, TEST_KEY);

    expect(encrypted).not.toContain(value.apiKey);
    expect(decryptCredential(encrypted, TEST_KEY)).toEqual(value);
  });

  it("rejects decryption with a different key", () => {
    const encrypted = encryptCredential({ apiKey: "secret" }, TEST_KEY);
    const otherKey = Buffer.alloc(32, 8).toString("base64");

    expect(() => decryptCredential(encrypted, otherKey)).toThrow(
      "凭证无法解密",
    );
  });

  it("only returns a masked hint", () => {
    expect(credentialHint({ apiKey: "sk-12345678" })).toBe("••••5678");
  });
});
