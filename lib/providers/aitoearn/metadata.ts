import type { Platform } from "@prisma/client";
import type {
  PlatformPublishRules,
  ProviderConnectionMetadata,
} from "@/lib/providers/types";

/**
 * C9 连接层:AiToEarn 供应商元数据与平台发布规则。
 *
 * 这是本地保守约束,用于前端提示与提交前校验,不代表供应商实时配额;
 * TODO(C10): AiToEarn 公开平台规则查询端点确认后,改为适配器拉取并
 * 归一化到 PlatformPublishRules,本文件退化为兜底默认值。
 */

const XIAOHONGSHU_RULES: PlatformPublishRules = {
  platform: "xiaohongshu",
  displayName: "小红书图文",
  assetTypes: ["image"],
  maxAssets: 18,
  minAssets: 1,
  maxTitleLength: 20,
  maxBodyLength: 1000,
  maxAssetSizeMb: 32,
  supportsSchedule: true,
  notes: "仅支持图片素材;首图会作为封面。",
};

const DOUYIN_RULES: PlatformPublishRules = {
  platform: "douyin",
  displayName: "抖音视频",
  assetTypes: ["video"],
  maxAssets: 1,
  minAssets: 1,
  maxTitleLength: 55,
  maxBodyLength: 1000,
  maxAssetSizeMb: 2048,
  supportsSchedule: true,
  notes: "需要一个成片视频;提交后可能进入“等待用户确认”,需在抖音 App 内完成最后一步。",
};

export const AITOEARN_PLATFORM_RULES: readonly PlatformPublishRules[] = [
  XIAOHONGSHU_RULES,
  DOUYIN_RULES,
];

export const AITOEARN_METADATA: ProviderConnectionMetadata = {
  provider: "aitoearn",
  displayName: "AiToEarn",
  capabilities: [
    "account_authorization",
    "account_listing",
    "asset_upload_signing",
    "publish_flow",
    "publish_record_sync",
  ],
  platforms: AITOEARN_PLATFORM_RULES,
};

export function getAiToEarnPlatformRules(platform: Platform): PlatformPublishRules | null {
  return AITOEARN_PLATFORM_RULES.find((rules) => rules.platform === platform) ?? null;
}
