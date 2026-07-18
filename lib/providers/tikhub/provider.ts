import { Platform } from "@prisma/client";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { providerFetchJson } from "@/lib/providers/http";
import type {
  CursorPage,
  ParsedReference,
  SocialAccount,
  SocialContent,
  SocialDataProvider,
  SocialMetrics,
} from "@/lib/providers/types";
import {
  dataRecord,
  extractContentList,
  extractCursor,
  normalizeAccount,
  normalizeContent,
  pickString,
} from "@/lib/providers/tikhub/normalizer";

export class TikHubProvider implements SocialDataProvider {
  readonly name = "tikhub";

  constructor(private readonly apiKey: string) {}

  async parseReference(input: string): Promise<ParsedReference> {
    const sourceUrl = new URL(input).toString();
    const url = new URL(sourceUrl);
    const host = url.hostname.toLowerCase();

    if (host.includes("xiaohongshu.com") || host.includes("xhslink.com")) {
      const contentId = url.pathname.match(/\/(?:explore|discovery\/item)\/([a-f\d]{24})/i)?.[1];
      const accountId = url.pathname.match(/\/user\/profile\/([a-f\d]{24})/i)?.[1];
      return {
        platform: Platform.xiaohongshu,
        kind: contentId ? "content" : "account",
        sourceUrl,
        platformContentId: contentId,
        platformAccountId: accountId,
      };
    }

    if (host.includes("douyin.com")) {
      const contentId = url.pathname.match(/\/video\/(\d+)/)?.[1];
      const accountId = url.pathname.match(/\/user\/([^/?]+)/)?.[1];
      return {
        platform: Platform.douyin,
        kind: contentId || host === "v.douyin.com" ? "content" : "account",
        sourceUrl,
        platformContentId: contentId,
        platformAccountId: accountId,
      };
    }

    throw new AppError("VALIDATION_ERROR", "目前只支持小红书和抖音链接。", 400);
  }

  async getAccount(reference: ParsedReference): Promise<SocialAccount> {
    if (!reference.platform || reference.kind !== "account") {
      throw new AppError("VALIDATION_ERROR", "该链接不是账号主页。", 400);
    }

    if (reference.platform === Platform.xiaohongshu) {
      const response = await this.get(
        "/api/v1/xiaohongshu/app_v2/get_user_info",
        reference.platformAccountId
          ? { user_id: reference.platformAccountId }
          : { share_text: reference.sourceUrl },
      );
      return normalizeAccount(
        reference.platform,
        response,
        reference.platformAccountId,
        reference.sourceUrl,
      );
    }

    let accountId = reference.platformAccountId;
    if (!accountId) {
      const extracted = await this.get("/api/v1/douyin/web/get_sec_user_id", {
        url: reference.sourceUrl,
      });
      accountId = pickString(dataRecord(extracted), ["sec_user_id", "data", "id"]);
    }
    if (!accountId) throw new AppError("PROVIDER_ERROR", "无法识别抖音账号 ID。", 422);
    const response = await this.get("/api/v1/douyin/web/handler_user_profile", {
      sec_user_id: accountId,
    });
    return normalizeAccount(
      reference.platform,
      response,
      accountId,
      reference.sourceUrl,
    );
  }

  async listAccountContent(
    account: SocialAccount,
    cursor = "0",
  ): Promise<CursorPage<SocialContent>> {
    const response =
      account.platform === Platform.xiaohongshu
        ? await this.get("/api/v1/xiaohongshu/app_v2/get_user_posted_notes", {
            user_id: account.platformAccountId,
            cursor,
          })
        : await this.get("/api/v1/douyin/web/fetch_user_post_videos", {
            sec_user_id: account.platformAccountId,
            max_cursor: cursor,
            count: "20",
            filter_type: "0",
          });
    const pagination = extractCursor(response);
    return {
      items: extractContentList(response).map((item) =>
        normalizeContent(account.platform, item),
      ),
      ...pagination,
    };
  }

  async getContent(reference: ParsedReference): Promise<SocialContent> {
    if (!reference.platform || reference.kind !== "content") {
      throw new AppError("VALIDATION_ERROR", "该链接不是作品链接。", 400);
    }

    if (reference.platform === Platform.douyin) {
      const response = reference.platformContentId
        ? await this.get("/api/v1/douyin/web/fetch_one_video", {
            aweme_id: reference.platformContentId,
            need_anchor_info: "false",
          })
        : await this.get("/api/v1/douyin/web/fetch_one_video_by_share_url", {
            share_url: reference.sourceUrl,
          });
      return normalizeContent(
        reference.platform,
        response,
        reference.platformContentId,
        reference.sourceUrl,
      );
    }

    const params: Record<string, string> = reference.platformContentId
      ? { note_id: reference.platformContentId }
      : { share_text: reference.sourceUrl };
    try {
      const response = await this.get(
        "/api/v1/xiaohongshu/app_v2/get_image_note_detail",
        params,
      );
      return normalizeContent(
        reference.platform,
        response,
        reference.platformContentId,
        reference.sourceUrl,
      );
    } catch {
      const response = await this.get(
        "/api/v1/xiaohongshu/app_v2/get_video_note_detail",
        params,
      );
      return normalizeContent(
        reference.platform,
        response,
        reference.platformContentId,
        reference.sourceUrl,
      );
    }
  }

  async refreshMetrics(reference: ParsedReference): Promise<SocialMetrics> {
    const content = await this.getContent(reference);
    return content.metrics;
  }

  private async get(path: string, params: Record<string, string>) {
    const url = new URL(path, env.TIKHUB_BASE_URL);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
    return providerFetchJson(
      url,
      { headers: { Authorization: `Bearer ${this.apiKey}` } },
      this.name,
    );
  }
}
