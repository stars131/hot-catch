import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAiToEarnConnectionStatus } from "@/lib/services/connection-service";
import { getAiToEarnConnectionState } from "@/lib/creator/publish-handoff";
import { saveCredential } from "@/lib/services/credential-service";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const secret = `aitoearn-secret-${runId}`;
let userAId = "";
let userBId = "";

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.user.create({ data: { email: `conn-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `conn-b-${runId}@example.com` } }),
  ]);
  userAId = a.id;
  userBId = b.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("AiToEarn connection status (C9 connection layer)", () => {
  it("reports an explicit not_configured state instead of throwing", async () => {
    const status = await getAiToEarnConnectionStatus(userAId);
    expect(status.connection).toBe("not_configured");
    expect(status.keyHint).toBeNull();
    expect(status.metadata.platforms.length).toBe(2);
  });

  it("reports connected after saving a credential, without leaking plaintext", async () => {
    await saveCredential(userAId, "aitoearn", { apiKey: secret });
    const status = await getAiToEarnConnectionStatus(userAId);
    expect(status.connection).toBe("connected");
    expect(status.keyHint).toBeTruthy();
    expect(JSON.stringify(status)).not.toContain(secret);
  });

  it("is isolated per user: user B stays not_configured", async () => {
    const status = await getAiToEarnConnectionStatus(userBId);
    expect(status.connection).toBe("not_configured");
  });

  it("maps invalid credentials to an explicit invalid state and keeps the chat protocol mapping", async () => {
    await prisma.providerCredential.update({
      where: { userId_provider: { userId: userAId, provider: "aitoearn" } },
      data: { status: "invalid" },
    });
    const status = await getAiToEarnConnectionStatus(userAId);
    expect(status.connection).toBe("invalid");
    await expect(getAiToEarnConnectionState(userAId)).resolves.toBe("invalid");
    await expect(getAiToEarnConnectionState(userBId)).resolves.toBe("missing");
  });
});
