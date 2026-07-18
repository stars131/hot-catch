import type { HotspotPayload } from "@/lib/hotspots/hotspot-service";

export const HOTSPOT_BROWSER_CACHE_KEY = "startrace:hotspots:v1";
export const HOTSPOT_BROWSER_CACHE_MS = 30 * 60 * 1000;

export type HotspotBrowserCache = {
  storedAt: number;
  payload: HotspotPayload;
};

export function parseHotspotBrowserCache(raw: string | null): HotspotBrowserCache | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<HotspotBrowserCache>;
    if (
      typeof parsed.storedAt !== "number" ||
      !parsed.payload ||
      !Array.isArray(parsed.payload.topics) ||
      !Array.isArray(parsed.payload.platforms) ||
      !Array.isArray(parsed.payload.sourceHealth) ||
      !Array.isArray(parsed.payload.sourceCatalog)
    ) {
      return null;
    }
    return parsed as HotspotBrowserCache;
  } catch {
    return null;
  }
}

export function readHotspotBrowserCache(): HotspotBrowserCache | null {
  try {
    const cached = parseHotspotBrowserCache(
      window.sessionStorage.getItem(HOTSPOT_BROWSER_CACHE_KEY),
    );
    if (!cached) window.sessionStorage.removeItem(HOTSPOT_BROWSER_CACHE_KEY);
    return cached;
  } catch {
    return null;
  }
}

export function writeHotspotBrowserCache(payload: HotspotPayload): void {
  try {
    window.sessionStorage.setItem(
      HOTSPOT_BROWSER_CACHE_KEY,
      JSON.stringify({ storedAt: Date.now(), payload } satisfies HotspotBrowserCache),
    );
  } catch {
    // Browser privacy and quota restrictions should not block hotspot rendering.
  }
}
