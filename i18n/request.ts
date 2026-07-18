import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import type { UiLocale } from "@/lib/platforms/registry";

export const UI_LOCALE_COOKIE = "STARTRACE_UI_LOCALE";

export default getRequestConfig(async () => {
  const locale = await resolveRequestLocale();
  const messages =
    locale === "en-US"
      ? (await import("../messages/en-US.json")).default
      : (await import("../messages/zh-CN.json")).default;
  return { locale, messages };
});

async function resolveRequestLocale(): Promise<UiLocale> {
  if (process.env.UI_I18N_ENABLED === "0") return "zh-CN";
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(UI_LOCALE_COOKIE)?.value;
  if (cookieLocale === "zh-CN" || cookieLocale === "en-US") return cookieLocale;

  const headerStore = await headers();
  const accepted = headerStore.get("accept-language")?.toLowerCase() ?? "";
  return accepted.split(",").some((value) => value.trim().startsWith("en"))
    ? "en-US"
    : "zh-CN";
}
