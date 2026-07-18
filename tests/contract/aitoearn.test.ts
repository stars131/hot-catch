import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import flowCreated from "@/tests/fixtures/aitoearn/flow-created.json";
import recordAwaitingUser from "@/tests/fixtures/aitoearn/record-awaiting-user.json";
import userAction from "@/tests/fixtures/aitoearn/user-action.json";
import accountsFixture from "@/tests/fixtures/aitoearn/accounts.json";
import authUrlFixture from "@/tests/fixtures/aitoearn/auth-url.json";
import authStatusFixture from "@/tests/fixtures/aitoearn/auth-status.json";
import { AiToEarnProvider } from "@/lib/providers/aitoearn/provider";

const baseUrl = "https://aitoearn.test";
const apiKey = "aitoearn-secret-fixture";
let submittedFlow: unknown;
let authRequestUrl: URL | null = null;

const server = setupServer(
  http.get(`${baseUrl}/api/v2/channels/accounts`, ({ request }) => {
    if (request.headers.get("X-Api-Key") !== apiKey) return new HttpResponse(null, { status: 401 });
    return HttpResponse.json(accountsFixture);
  }),
  http.get(`${baseUrl}/api/v2/channels/accounts/auth/xiaohongshu`, ({ request }) => {
    if (request.headers.get("X-Api-Key") !== apiKey) return new HttpResponse(null, { status: 401 });
    authRequestUrl = new URL(request.url);
    return HttpResponse.json(authUrlFixture);
  }),
  http.get(
    `${baseUrl}/api/v2/channels/accounts/auth/xiaohongshu/status/auth-session-fixture-1`,
    () => HttpResponse.json(authStatusFixture),
  ),
  http.post(`${baseUrl}/api/assets/uploadSign`, ({ request }) => {
    if (request.headers.get("X-Api-Key") !== apiKey) return new HttpResponse(null, { status: 401 });
    return HttpResponse.json({
      data: {
        id: "asset-1",
        url: "https://assets.example/file.mp4",
        uploadUrl: "https://upload.example/presigned",
        uploadFields: { key: "temporary/file.mp4" },
      },
      code: 0,
    });
  }),
  http.post(`${baseUrl}/api/v2/channels/publish/flows`, async ({ request }) => {
    submittedFlow = await request.json();
    return HttpResponse.json(flowCreated);
  }),
  http.get(`${baseUrl}/api/v2/channels/publish/records/record-fixture-1`, () =>
    HttpResponse.json(recordAwaitingUser),
  ),
  http.get(
    `${baseUrl}/api/v2/channels/publish/records/record-fixture-1/user-action`,
    () => HttpResponse.json(userAction),
  ),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("AiToEarn provider contract", () => {
  const provider = new AiToEarnProvider(apiKey, baseUrl);

  it("returns local metadata and platform rules without any network call", () => {
    const metadata = provider.getMetadata();
    expect(metadata.provider).toBe("aitoearn");
    expect(metadata.platforms.map((rules) => rules.platform)).toEqual([
      "xiaohongshu",
      "douyin",
    ]);
    expect(JSON.stringify(metadata)).not.toContain(apiKey);
  });

  it("maps the authorization intent to url + sessionId without leaking the key", async () => {
    const intent = await provider.getAuthorizationUrl("xiaohongshu");
    expect(intent).toEqual({
      authorizationUrl: "https://auth.aitoearn.test/oauth/xiaohongshu?state=fixture-state",
      sessionId: "auth-session-fixture-1",
    });
    expect(authRequestUrl?.searchParams.get("redirectUri")).toContain("/settings/connections");
    expect(JSON.stringify(intent)).not.toContain(apiKey);
  });

  it("queries the authorization session status by sessionId", async () => {
    await expect(
      provider.getAuthorizationStatus("xiaohongshu", "auth-session-fixture-1"),
    ).resolves.toMatchObject({ status: "pending" });
  });

  it("normalizes accounts and drops unsupported platforms", async () => {
    const accounts = await provider.listAccounts();
    expect(accounts).toEqual([
      expect.objectContaining({
        id: "acct-xhs-1",
        platform: "xiaohongshu",
        name: "星迹小红书号",
        status: "active",
      }),
      expect.objectContaining({
        id: "acct-dy-1",
        platform: "douyin",
        status: "expired",
      }),
    ]);
    expect(JSON.stringify(accounts)).not.toContain(apiKey);
  });

  it("maps upload signing without returning the API key", async () => {
    const signature = await provider.signAssetUpload({
      fileName: "video.mp4",
      contentType: "video/mp4",
      size: 1024,
    });
    expect(signature).toMatchObject({
      assetId: "asset-1",
      method: "POST",
      uploadUrl: "https://upload.example/presigned",
    });
    expect(JSON.stringify(signature)).not.toContain(apiKey);
  });

  it("adds a local idempotency marker to the Flow context", async () => {
    const record = await provider.createFlow({
      platform: "douyin",
      accountId: "douyin_test_account",
      idempotencyKey: "local-idempotency-key",
      payload: {
        content: { title: "测试", body: "正文", media: [] },
        items: [{ platform: "douyin", accountId: "douyin_test_account" }],
      },
    });
    expect(record).toMatchObject({
      flowId: "9b0d418e-7b06-42f4-bf16-e446bde72cf4",
      recordId: "6a423ff4ff7bb08a379a735c",
    });
    expect(submittedFlow).toMatchObject({
      context: { source: "startrace", idempotencyKey: "local-idempotency-key" },
    });
  });

  it("maps status 8 to awaiting_user and retrieves the Douyin short link", async () => {
    await expect(provider.getRecord("record-fixture-1")).resolves.toMatchObject({
      status: "awaiting_user",
      shortLink: "https://v.douyin.com/fixture/",
    });
  });
});
