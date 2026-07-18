import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CredentialProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  listCredentialSummaries,
  loadCredential,
  saveCredential,
} from "@/lib/services/credential-service";
import { listAccounts } from "@/lib/services/benchmark-service";
import { listIdeas, updateIdea } from "@/lib/services/idea-service";
import {
  getEffectivePersona,
  upsertPersona,
} from "@/lib/services/persona-service";
import {
  getStyleProfile,
  listStyleProfiles,
  updateStyleProfile,
} from "@/lib/services/style-profile-service";
import {
  activateScoringRubric,
  createScoringRubricVersion,
  listScoringRubrics,
} from "@/lib/services/rubric-service";
import {
  loadUserHotspotCookieStore,
  saveUserHotspotCookieConfig,
} from "@/lib/hotspots/user-cookie-store";
import {
  listTrackedPublications,
  saveManualMetrics,
} from "@/lib/tracking/tracking-service";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userAId = "";
let userBId = "";

beforeAll(async () => {
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `isolation-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `isolation-b-${runId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("cross-user isolation", () => {
  it("keeps historical tracking records and manual metrics private", async () => {
    const publication = await prisma.trackedPublication.create({
      data: {
        userId: userAId,
        sourceKind: "web_article",
        status: "active",
        publicUrl: `https://web.test/articles/${runId}`,
        urlFingerprint: `tracking-${runId}`,
        title: "A 的历史文章",
      },
    });

    expect((await listTrackedPublications(userBId)).some((item) => item.id === publication.id)).toBe(false);
    await expect(
      saveManualMetrics(userBId, publication.id, { viewCount: 99 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const snapshot = await saveManualMetrics(userAId, publication.id, {
      viewCount: 120,
      likeCount: 8,
    });
    expect(snapshot).toMatchObject({
      userId: userAId,
      source: "manual",
      viewCount: 120,
      likeCount: 8,
    });
  });

  it("does not expose benchmark accounts owned by another user", async () => {
    const account = await prisma.benchmarkAccount.create({
      data: {
        userId: userAId,
        platform: "xiaohongshu",
        platformAccountId: `account-${runId}`,
        xhsId: `account-${runId}`,
        nickname: "A 的账号",
      },
    });

    const visibleToA = await listAccounts(userAId);
    const visibleToB = await listAccounts(userBId);
    expect(visibleToA.some((item) => item.id === account.id)).toBe(true);
    expect(visibleToB.some((item) => item.id === account.id)).toBe(false);
  });

  it("never returns or decrypts another user's provider credential", async () => {
    await saveCredential(userAId, CredentialProvider.tikhub, {
      apiKey: `secret-${runId}`,
    });

    const summaries = await listCredentialSummaries(userBId);
    expect(
      summaries.find((item) => item.provider === CredentialProvider.tikhub),
    ).toMatchObject({ configured: false, status: "missing" });
    await expect(
      loadCredential(userBId, CredentialProvider.tikhub),
    ).rejects.toMatchObject({ code: "CREDENTIAL_NOT_CONFIGURED" });
  });

  it("hides ideas from other users and rejects cross-user idea updates", async () => {
    const idea = await prisma.idea.create({
      data: { userId: userAId, title: `A 的选题 ${runId}`, source: "manual" },
    });

    const visibleToB = await listIdeas(userBId);
    expect(visibleToB.some((item) => item.id === idea.id)).toBe(false);
    await expect(
      updateIdea(userBId, idea.id, { title: "被劫持的标题" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const untouched = await prisma.idea.findUnique({ where: { id: idea.id } });
    expect(untouched?.title).toBe(`A 的选题 ${runId}`);
  });

  it("rejects cross-user persona overwrite via upsert id and never falls back to another user's persona", async () => {
    const personaA = await upsertPersona(userAId, {
      name: `A 的人设 ${runId}`,
    });

    await expect(
      upsertPersona(userBId, { id: personaA.id, name: "被劫持的人设" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const untouched = await prisma.persona.findUnique({
      where: { id: personaA.id },
    });
    expect(untouched?.name).toBe(`A 的人设 ${runId}`);
    expect(untouched?.userId).toBe(userAId);

    const effectiveForB = await getEffectivePersona(userBId, personaA.id);
    expect(effectiveForB?.id).not.toBe(personaA.id);
  });

  it("rejects cross-user style profile reads and updates", async () => {
    const profile = await prisma.creatorStyleProfile.create({
      data: {
        userId: userAId,
        platform: "xiaohongshu",
        name: `A 的风格画像 ${runId}`,
      },
    });

    const visibleToB = await listStyleProfiles(userBId);
    expect(visibleToB.some((item) => item.id === profile.id)).toBe(false);
    await expect(getStyleProfile(userBId, profile.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      updateStyleProfile(userBId, profile.id, { name: "被劫持的画像" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects cross-user scoring rubric activation", async () => {
    const rubric = await createScoringRubricVersion(userAId, {
      platform: "xiaohongshu",
      contentKind: "xhs_graphic",
      name: `A 的评分规则 ${runId}`,
      rules: { hookWeight: 0.4 },
    });

    const visibleToB = await listScoringRubrics(userBId);
    expect(visibleToB.some((item) => item.id === rubric.id)).toBe(false);
    await expect(
      activateScoringRubric(userBId, rubric.id, {
        confirmed: true,
        backtestResult: { sampleSize: 5, previousScore: 60, candidateScore: 80 },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const untouched = await prisma.scoringRubric.findUnique({
      where: { id: rubric.id },
    });
    expect(untouched?.status).toBe("draft");
  });

  it("keeps hotspot cookies per user and out of credential summaries", async () => {
    const secretCookie = `web_session=leak-${runId}`;
    await saveUserHotspotCookieConfig(userAId, "xiaohongshu", {
      cookie: secretCookie,
    });

    const storeForA = await loadUserHotspotCookieStore(userAId);
    expect(storeForA.xiaohongshu?.cookie).toBe(secretCookie);
    const storeForB = await loadUserHotspotCookieStore(userBId);
    expect(storeForB).toEqual({});

    const summaries = await listCredentialSummaries(userAId);
    expect(JSON.stringify(summaries)).not.toContain(secretCookie);
  });
});
