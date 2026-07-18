import { createHash } from "node:crypto";
import {
  CONTENT_LOCALES,
  PLATFORM_DEFINITIONS,
  PLATFORM_IDS,
  contentLocaleLabel,
  isContentLocale,
  platformLabel,
  type UiLocale,
} from "@/lib/platforms/registry";
import type { CreationSetupCard } from "@/lib/creator/chat-protocol";
import { prisma } from "@/lib/prisma";
import { listSkillsForUser } from "@/lib/services/skill-service";
import { isForeignPlatformCreationEnabled } from "@/lib/env";
import type {
  DirectionSelection,
  DirectionSnapshot,
} from "@/lib/creator/creative-direction";

export async function buildCreationSetupCard(params: {
  userId: string;
  conversationId: string;
  brief: string;
  directionSelection?: DirectionSelection;
  directionSnapshot?: DirectionSnapshot;
  directionSummary?: { primaryLabel: string; secondaryLabel?: string };
  uiLocale: UiLocale;
  nonce: string;
}): Promise<CreationSetupCard> {
  const [conversation, skills, accounts] = await Promise.all([
    prisma.conversation.findFirst({
      where: { id: params.conversationId, userId: params.userId },
      select: { targetPlatforms: true, targetLocale: true, activeSkillIds: true },
    }),
    listSkillsForUser(params.userId),
    prisma.socialConnection.findMany({
      where: { userId: params.userId, archivedAt: null, status: "active" },
      orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    }),
  ]);
  const allowedPlatforms = PLATFORM_IDS.filter(
    (platform) =>
      PLATFORM_DEFINITIONS[platform].group === "domestic" ||
      isForeignPlatformCreationEnabled(),
  );
  const savedPlatforms = (conversation?.targetPlatforms ?? []).filter((platform) =>
    allowedPlatforms.includes(platform),
  );
  const defaultLocale = isContentLocale(conversation?.targetLocale)
    ? conversation.targetLocale
    : "zh-CN";
  const generationSkills = skills.filter(
    (skill) => skill.enabled && skill.scopes.includes("generation"),
  );
  const availableSkillIds = new Set(generationSkills.map((skill) => skill.id));
  const defaultSkillIds = (conversation?.activeSkillIds ?? []).filter((id) =>
    availableSkillIds.has(id),
  );
  const zh = params.uiLocale === "zh-CN";
  const digest = createHash("sha256")
    .update(`${params.conversationId}:${params.nonce}`)
    .digest("hex")
    .slice(0, 16);

  return {
    id: `card-creation-${digest}`,
    version: 1,
    type: "creation_setup",
    brief: params.brief.trim(),
    ...(params.directionSelection ? { directionSelection: params.directionSelection } : {}),
    ...(params.directionSnapshot || params.directionSummary ? {
      directionSummary: params.directionSummary ?? {
        primaryLabel: zh
          ? params.directionSnapshot!.primary.labels.zhCN
          : params.directionSnapshot!.primary.labels.enUS,
        ...(params.directionSnapshot!.secondary ? {
          secondaryLabel: zh
            ? params.directionSnapshot!.secondary!.labels.zhCN
            : params.directionSnapshot!.secondary!.labels.enUS,
        } : {}),
      },
    } : {}),
    uiLocale: params.uiLocale,
    maxPlatforms: 5,
    platformOptions: allowedPlatforms.map((platform) => {
      const definition = PLATFORM_DEFINITIONS[platform];
      return {
        id: platform,
        label: platformLabel(platform, params.uiLocale),
        description:
          params.uiLocale === "en-US"
            ? definition.formatNameEn
            : definition.formatName,
        group: definition.group,
      };
    }),
    localeOptions: CONTENT_LOCALES.map((locale) => ({
      id: locale,
      label: contentLocaleLabel(locale, params.uiLocale),
    })),
    skillOptions: generationSkills.map((skill) => ({
      id: skill.id,
      label: skill.name,
      description: skill.description,
    })),
    accountOptions: accounts.map((account) => ({
      id: account.id,
      platform: account.platform,
      label: account.displayName || account.handle || account.externalAccountId,
      ...(account.handle ? { handle: account.handle } : {}),
      ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
      source: account.source,
    })),
    defaultPlatformIds: savedPlatforms.length ? savedPlatforms.slice(0, 5) : ["xiaohongshu"],
    defaultLocaleId: defaultLocale,
    defaultSkillIds: defaultSkillIds.slice(0, 8),
    defaultAccountBindings: Object.fromEntries(
      allowedPlatforms.flatMap((platform) => {
        const account = accounts.find((item) => item.platform === platform && item.isDefault);
        return account ? [[platform, account.id]] : [];
      }),
    ),
    confirmAction: {
      actionId: "creation.generate_bundle",
      label: zh ? "确认并开始生成" : "Confirm and generate",
      appearance: "primary",
    },
  };
}
