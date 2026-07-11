import { z } from "zod";

/**
 * star-skill/v1:外接 Skill 的稳定协议。
 *
 * 第一阶段只允许代码内置 Registry;Skill 只能返回 cardDrafts / proposedEffects,
 * 由主应用校验并执行,不能直接写数据库或获得凭证原文。
 * Beta 阶段禁止:任意远程执行 URL、动态 npm 包、eval、浏览器端执行外部脚本。
 */

export const SKILL_PROTOCOL = "star-skill/v1" as const;

export const SKILL_CAPABILITIES = [
  "conversation.read_current",
  "reference.read_selected",
  "idea.read",
  "content.read",
  "content.propose_revision",
  "job.request",
] as const;

export type SkillCapability = (typeof SKILL_CAPABILITIES)[number];

export type SkillManifestV1 = {
  protocol: typeof SKILL_PROTOCOL;
  id: string;
  version: string;
  name: string;
  description: string;
  triggers: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiredCapabilities: SkillCapability[];
  requiredCredentials?: string[];
  execution: { type: "builtin" } | { type: "remote"; endpoint: string };
};

export type SkillExecutionResultV1 = {
  status: "completed" | "waiting_input" | "failed";
  text?: string;
  cardDrafts?: Array<Record<string, unknown>>;
  proposedEffects?: Array<
    | { type: "content.propose_revision"; payload: unknown }
    | { type: "job.request"; action: string; input: unknown }
  >;
};

const SKILL_ID = /^[a-z][a-z0-9._-]{1,63}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/;

export const skillCapabilitySchema = z.enum(SKILL_CAPABILITIES);

export const skillExecutionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("builtin") }).strict(),
  z
    .object({
      type: z.literal("remote"),
      endpoint: z
        .string()
        .max(2048)
        .url()
        .refine((value) => /^https:\/\//i.test(value), "远程 Skill 只允许 https"),
    })
    .strict(),
]);

export const skillManifestSchema = z
  .object({
    protocol: z.literal(SKILL_PROTOCOL),
    id: z.string().regex(SKILL_ID, "Skill id 必须是稳定小写标识符"),
    version: z.string().regex(SEMVER, "版本号必须是语义化版本"),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(500),
    triggers: z.array(z.string().min(1).max(80)).max(20),
    inputSchema: z.record(z.unknown()),
    outputSchema: z.record(z.unknown()),
    requiredCapabilities: z.array(skillCapabilitySchema).max(SKILL_CAPABILITIES.length),
    requiredCredentials: z.array(z.string().min(1).max(64)).max(10).optional(),
    execution: skillExecutionSchema,
  })
  .strict() satisfies z.ZodType<SkillManifestV1>;

export const skillProposedEffectSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("content.propose_revision"), payload: z.unknown() })
    .strict(),
  z
    .object({
      type: z.literal("job.request"),
      action: z.string().min(1).max(64),
      input: z.unknown(),
    })
    .strict(),
]);

export const skillExecutionResultSchema = z
  .object({
    status: z.enum(["completed", "waiting_input", "failed"]),
    text: z.string().max(20000).optional(),
    cardDrafts: z.array(z.record(z.unknown())).max(20).optional(),
    proposedEffects: z.array(skillProposedEffectSchema).max(20).optional(),
  })
  .strict();

/**
 * 校验 Skill 声明的能力是否都在授权范围内;越权即拒绝。
 */
export function assertCapabilitiesAllowed(
  manifest: SkillManifestV1,
  granted: readonly SkillCapability[],
): void {
  const missing = manifest.requiredCapabilities.filter(
    (capability) => !granted.includes(capability),
  );
  if (missing.length > 0) {
    throw new Error(`Skill ${manifest.id} 申请了未授权能力: ${missing.join(", ")}`);
  }
}
