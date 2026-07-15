import { NextRequest } from "next/server";
import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { UI_LOCALE_COOKIE } from "@/i18n/request";

const localeSchema = z.object({ locale: z.enum(["zh-CN", "en-US"]) }).strict();

export async function POST(request: NextRequest) {
  try {
    const { locale } = localeSchema.parse(await request.json());
    const response = ok({ locale });
    response.cookies.set(UI_LOCALE_COOKIE, locale, {
      maxAge: 365 * 24 * 60 * 60,
      sameSite: "lax",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
    return response;
  } catch (error) {
    return fail(error);
  }
}
