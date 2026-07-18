import { existsSync, readFileSync } from "fs";
import { mkdir, readFile, rename, rm, writeFile } from "fs/promises";
import path from "path";

type HotspotCookieEntry = {
  cookie?: string;
  upstream?: string;
  updatedAt?: string;
};

type HotspotCookieStore = Record<string, HotspotCookieEntry>;

const STORE_PATH = path.join(process.cwd(), ".hotspot-cookies.local.json");

function parseStore(raw: string): HotspotCookieStore {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).flatMap(([code, value]) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const record = value as Record<string, unknown>;
        const entry: HotspotCookieEntry = {};
        if (typeof record.cookie === "string" && record.cookie.trim()) {
          entry.cookie = record.cookie.trim();
        }
        if (typeof record.upstream === "string" && record.upstream.trim()) {
          entry.upstream = record.upstream.trim();
        }
        if (typeof record.updatedAt === "string") {
          entry.updatedAt = record.updatedAt;
        }
        return entry.cookie || entry.upstream ? [[code, entry]] : [];
      })
    );
  } catch {
    return {};
  }
}

export function readHotspotCookieStoreSync(): HotspotCookieStore {
  if (process.env.NODE_ENV === "production") return {};
  if (!existsSync(STORE_PATH)) return {};
  return parseStore(readFileSync(STORE_PATH, "utf8"));
}

export async function readHotspotCookieStore(): Promise<HotspotCookieStore> {
  if (process.env.NODE_ENV === "production") return {};
  try {
    return parseStore(await readFile(STORE_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function getStoredHotspotCookieConfig(code: string): HotspotCookieEntry | null {
  return readHotspotCookieStoreSync()[code] ?? null;
}

async function writeHotspotCookieStore(store: HotspotCookieStore) {
  if (Object.keys(store).length === 0) {
    await rm(STORE_PATH, { force: true });
    return;
  }

  const tmpPath = `${STORE_PATH}.${process.pid}.tmp`;
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(tmpPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await rename(tmpPath, STORE_PATH);
}

export async function saveHotspotCookieConfig(
  code: string,
  config: { cookie?: string; upstream?: string }
) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境禁止使用本地热点 Cookie 文件。");
  }
  const store = await readHotspotCookieStore();
  const cookie = config.cookie?.trim();
  const upstream = config.upstream?.trim();
  if (!cookie && !upstream) {
    delete store[code];
  } else {
    store[code] = {
      ...(cookie ? { cookie } : {}),
      ...(upstream ? { upstream } : {}),
      updatedAt: new Date().toISOString(),
    };
  }
  await writeHotspotCookieStore(store);
}

export async function clearHotspotCookieConfig(code: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("生产环境禁止使用本地热点 Cookie 文件。");
  }
  const store = await readHotspotCookieStore();
  delete store[code];
  await writeHotspotCookieStore(store);
}
