import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import flowCreated from "@/tests/fixtures/aitoearn/flow-created.json";
import recordAwaitingUser from "@/tests/fixtures/aitoearn/record-awaiting-user.json";
import userAction from "@/tests/fixtures/aitoearn/user-action.json";
import { AiToEarnProvider } from "@/lib/providers/aitoearn/provider";

const baseUrl = "https://aitoearn.test";
const apiKey = "aitoearn-secret-fixture";
let submittedFlow: unknown;

const server = setupServer(
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
