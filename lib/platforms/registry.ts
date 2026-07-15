export const PLATFORM_IDS = [
  "xiaohongshu",
  "douyin",
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "reddit",
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export const CONTENT_KIND_IDS = [
  "xhs_graphic",
  "douyin_video_script",
  "youtube_video_package",
  "tiktok_short_video_script",
  "instagram_carousel",
  "x_thread",
  "reddit_post",
] as const;

export type ContentKindId = (typeof CONTENT_KIND_IDS)[number];

export const UI_LOCALES = ["zh-CN", "en-US"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];

export const CONTENT_LOCALES = [
  "zh-CN",
  "en-US",
  "ja-JP",
  "ko-KR",
  "es-ES",
  "fr-FR",
  "de-DE",
  "pt-BR",
] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export type PlatformGroup = "domestic" | "global";
export type PlatformCapabilityState = "available" | "provider_required" | "export_only";

export type PlatformDefinition = {
  id: PlatformId;
  contentKind: ContentKindId;
  group: PlatformGroup;
  displayName: string;
  displayNameEn: string;
  formatName: string;
  formatNameEn: string;
  creation: PlatformCapabilityState;
  publicReferenceImport: PlatformCapabilityState;
  publishing: PlatformCapabilityState;
  analytics: PlatformCapabilityState;
  supportsStructuredPatch: boolean;
};

export const PLATFORM_DEFINITIONS = {
  xiaohongshu: {
    id: "xiaohongshu",
    contentKind: "xhs_graphic",
    group: "domestic",
    displayName: "小红书",
    displayNameEn: "Xiaohongshu",
    formatName: "图文",
    formatNameEn: "Graphic post",
    creation: "available",
    publicReferenceImport: "provider_required",
    publishing: "provider_required",
    analytics: "provider_required",
    supportsStructuredPatch: true,
  },
  douyin: {
    id: "douyin",
    contentKind: "douyin_video_script",
    group: "domestic",
    displayName: "抖音",
    displayNameEn: "Douyin",
    formatName: "短视频脚本",
    formatNameEn: "Short-video script",
    creation: "available",
    publicReferenceImport: "provider_required",
    publishing: "provider_required",
    analytics: "provider_required",
    supportsStructuredPatch: true,
  },
  youtube: {
    id: "youtube",
    contentKind: "youtube_video_package",
    group: "global",
    displayName: "YouTube",
    displayNameEn: "YouTube",
    formatName: "视频内容包",
    formatNameEn: "Video package",
    creation: "available",
    publicReferenceImport: "available",
    publishing: "export_only",
    analytics: "export_only",
    supportsStructuredPatch: false,
  },
  tiktok: {
    id: "tiktok",
    contentKind: "tiktok_short_video_script",
    group: "global",
    displayName: "TikTok",
    displayNameEn: "TikTok",
    formatName: "短视频脚本",
    formatNameEn: "Short-video script",
    creation: "available",
    publicReferenceImport: "available",
    publishing: "export_only",
    analytics: "export_only",
    supportsStructuredPatch: false,
  },
  instagram: {
    id: "instagram",
    contentKind: "instagram_carousel",
    group: "global",
    displayName: "Instagram",
    displayNameEn: "Instagram",
    formatName: "轮播图文",
    formatNameEn: "Carousel",
    creation: "available",
    publicReferenceImport: "available",
    publishing: "export_only",
    analytics: "export_only",
    supportsStructuredPatch: false,
  },
  x: {
    id: "x",
    contentKind: "x_thread",
    group: "global",
    displayName: "X",
    displayNameEn: "X",
    formatName: "线程",
    formatNameEn: "Thread",
    creation: "available",
    publicReferenceImport: "available",
    publishing: "export_only",
    analytics: "export_only",
    supportsStructuredPatch: false,
  },
  reddit: {
    id: "reddit",
    contentKind: "reddit_post",
    group: "global",
    displayName: "Reddit",
    displayNameEn: "Reddit",
    formatName: "社区帖子",
    formatNameEn: "Community post",
    creation: "available",
    publicReferenceImport: "available",
    publishing: "export_only",
    analytics: "export_only",
    supportsStructuredPatch: false,
  },
} as const satisfies Record<PlatformId, PlatformDefinition>;

export const PLATFORM_BY_CONTENT_KIND = Object.fromEntries(
  Object.values(PLATFORM_DEFINITIONS).map((definition) => [
    definition.contentKind,
    definition.id,
  ]),
) as Record<ContentKindId, PlatformId>;

export const GLOBAL_PLATFORM_IDS = PLATFORM_IDS.filter(
  (platform) => PLATFORM_DEFINITIONS[platform].group === "global",
);

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === "string" && (PLATFORM_IDS as readonly string[]).includes(value);
}

export function isContentKindId(value: unknown): value is ContentKindId {
  return typeof value === "string" && (CONTENT_KIND_IDS as readonly string[]).includes(value);
}

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === "string" && (UI_LOCALES as readonly string[]).includes(value);
}

export function isContentLocale(value: unknown): value is ContentLocale {
  return typeof value === "string" && (CONTENT_LOCALES as readonly string[]).includes(value);
}

export function platformSupportsContentKind(
  platform: PlatformId,
  contentKind: ContentKindId,
): boolean {
  return PLATFORM_DEFINITIONS[platform].contentKind === contentKind;
}

export function platformLabel(platform: PlatformId, locale: UiLocale): string {
  const definition = PLATFORM_DEFINITIONS[platform];
  return locale === "en-US" ? definition.displayNameEn : definition.displayName;
}

export const CONTENT_LOCALE_LABELS: Record<ContentLocale, { zh: string; en: string }> = {
  "zh-CN": { zh: "简体中文", en: "Simplified Chinese" },
  "en-US": { zh: "英语", en: "English" },
  "ja-JP": { zh: "日语", en: "Japanese" },
  "ko-KR": { zh: "韩语", en: "Korean" },
  "es-ES": { zh: "西班牙语", en: "Spanish" },
  "fr-FR": { zh: "法语", en: "French" },
  "de-DE": { zh: "德语", en: "German" },
  "pt-BR": { zh: "巴西葡萄牙语", en: "Brazilian Portuguese" },
};

export function contentLocaleLabel(locale: ContentLocale, uiLocale: UiLocale): string {
  return uiLocale === "en-US"
    ? CONTENT_LOCALE_LABELS[locale].en
    : CONTENT_LOCALE_LABELS[locale].zh;
}
