import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

export async function providerFetchJson(
  url: URL,
  init: RequestInit,
  providerName: string,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
    const bodyText = await response.text();
    let body: unknown;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = { message: bodyText.slice(0, 500) };
    }

    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? 422 : 502;
      const code = status === 422 ? "CREDENTIAL_INVALID" : "PROVIDER_ERROR";
      throw new AppError(
        code,
        `${providerName} 请求失败（HTTP ${response.status}）。`,
        status,
        process.env.NODE_ENV === "production" ? undefined : body,
      );
    }
    return body;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("PROVIDER_ERROR", `${providerName} 请求超时。`, 504);
    }
    throw new AppError("PROVIDER_ERROR", `${providerName} 暂时不可用。`, 502);
  } finally {
    clearTimeout(timeout);
  }
}
