import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { providerFetchJson } from "@/lib/providers/http";
import type { WebReferenceProvider } from "@/lib/providers/types";

export class FirecrawlProvider implements WebReferenceProvider {
  readonly name = "firecrawl";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = env.FIRECRAWL_BASE_URL,
  ) {}

  async importUrl(url: string) {
    const endpoint = new URL("/v2/scrape", this.baseUrl);
    const response = asRecord(
      await providerFetchJson(
        endpoint,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url,
            formats: ["markdown"],
            onlyMainContent: true,
            removeBase64Images: true,
            blockAds: true,
            zeroDataRetention: true,
          }),
        },
        this.name,
      ),
    );
    const data = asRecord(response.data ?? response);
    const markdown = typeof data.markdown === "string" ? data.markdown.trim() : "";
    if (!markdown) throw new AppError("PROVIDER_ERROR", "Firecrawl 未返回正文。", 502);
    const metadata = asRecord(data.metadata);
    return {
      title: typeof metadata.title === "string" ? metadata.title : undefined,
      markdown,
      metadata,
    };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
