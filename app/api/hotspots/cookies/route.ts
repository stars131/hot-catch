import { NextRequest } from "next/server";
import { z } from "zod";
import {
  clearHotspotCache,
  listHotspotSourceDefinitions,
} from "@/lib/hotspots/hotspot-service";
import {
  clearHotspotCookieConfig,
  saveHotspotCookieConfig,
} from "@/lib/hotspots/cookie-store";
import { AppError } from "@/lib/errors";
import { ok, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import {
  clearUserHotspotCookieConfig,
  loadUserHotspotCookieStore,
  saveUserHotspotCookieConfig,
  type UserHotspotCookieStore,
} from "@/lib/hotspots/user-cookie-store";

export const runtime = "nodejs";

const cookieConfigSchema = z.object({
  code: z.string().min(1),
  cookie: z.string().max(20000).optional(),
  upstream: z.string().url().max(4000).optional().or(z.literal("")),
  clear: z.boolean().optional(),
});

function listCookieSources(store?: UserHotspotCookieStore) {
  return listHotspotSourceDefinitions(store).filter((source) => source.supportsOptionalConnection);
}

export async function GET() {
  try {
    const user = await requireUser();
    const store = process.env.NODE_ENV === "production"
      ? await loadUserHotspotCookieStore(user.id)
      : undefined;
    return ok({
      generatedAt: new Date().toISOString(),
      sources: listCookieSources(store),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const input = cookieConfigSchema.parse(await req.json());
    const existingStore = process.env.NODE_ENV === "production"
      ? await loadUserHotspotCookieStore(user.id)
      : undefined;
    const source = listCookieSources(existingStore).find((item) => item.code === input.code);
    if (!source) {
      throw new AppError("NOT_FOUND", "Hotspot source not found or does not support an optional connection.", 404);
    }

    let store = existingStore;
    if (process.env.NODE_ENV === "production") {
      store = input.clear
        ? await clearUserHotspotCookieConfig(user.id, input.code)
        : await saveUserHotspotCookieConfig(user.id, input.code, {
            cookie: input.cookie,
            upstream: input.upstream,
          });
    } else if (input.clear) {
      await clearHotspotCookieConfig(input.code);
    } else {
      await saveHotspotCookieConfig(input.code, {
        cookie: input.cookie,
        upstream: input.upstream,
      });
    }

    clearHotspotCache();
    return ok({
      generatedAt: new Date().toISOString(),
      sources: listCookieSources(store),
    });
  } catch (error) {
    return fail(error);
  }
}
