import {
  SKILL_PROTOCOL,
  assertCapabilitiesAllowed,
  skillExecutionResultSchema,
  skillManifestSchema,
  type SkillCapability,
  type SkillExecutionResultV1,
  type SkillManifestV1,
} from "@/lib/creator/skill-protocol";

/**
 * C7 内置 Skill Registry(star-skill/v1)。
 *
 * 第一阶段只有代码内置 Skill:注册表是静态白名单,不接受运行时注册;
 * Skill 只能返回经 schema 校验的 SkillExecutionResultV1(cardDrafts / proposedEffects),
 * 由 agent-service 校验后转换为 patch 卡等消息,Skill 自身不能触达
 * Prisma、供应商凭证或任意 URL。
 *
 * 所有内置 Skill 的改写都是本地确定性规则,产物必须标注 local_preview,
 * 不冒充 AI 输出;真实 DeepSeek 改写在后续批次接入时替换执行体,协议不变。
 */

/** 会话侧授予内置 Skill 的能力上限;申请超出即拒绝。 */
export const GRANTED_BUILTIN_CAPABILITIES: readonly SkillCapability[] = [
  "conversation.read_current",
  "content.read",
  "content.propose_revision",
];

export type BuiltinSkillInput = {
  instruction: string;
  sectionLabel: string;
  before: string;
  contentKind: "xhs_graphic" | "douyin_video_script";
};

type BuiltinSkillDefinition = {
  manifest: SkillManifestV1;
  /** Composer 技能菜单里的指令模板;{section} 会替换为区块名 */
  composerTemplate: string;
  execute: (input: BuiltinSkillInput) => SkillExecutionResultV1;
};

const PATCH_INPUT_SCHEMA = {
  type: "object",
  properties: {
    instruction: { type: "string", maxLength: 2000 },
    sectionLabel: { type: "string", maxLength: 120 },
    before: { type: "string", maxLength: 4000 },
    contentKind: { enum: ["xhs_graphic", "douyin_video_script"] },
  },
  required: ["instruction", "before"],
} as const;

const PATCH_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    status: { enum: ["completed", "waiting_input", "failed"] },
    proposedEffects: { type: "array" },
  },
  required: ["status"],
} as const;

function manifestOf(params: {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  capabilities: SkillCapability[];
}): SkillManifestV1 {
  return skillManifestSchema.parse({
    protocol: SKILL_PROTOCOL,
    id: params.id,
    version: "1.0.0",
    name: params.name,
    description: params.description,
    triggers: params.triggers,
    inputSchema: PATCH_INPUT_SCHEMA,
    outputSchema: PATCH_OUTPUT_SCHEMA,
    requiredCapabilities: params.capabilities,
    execution: { type: "builtin" },
  });
}

// ---------------------------------------------------------------------------
// 确定性本地改写规则(协议预览,非 AI 输出)
// ---------------------------------------------------------------------------

const FILLER_WORDS = ["其实", "然后", "就是说", "的话", "那么", "基本上", "可以说"];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").replace(/([,。!?;、])\1+/g, "$1").trim();
}

/**
 * 指令中的「……」引号内容视为用户给定的替换文本,优先直接采用。
 * 「让星迹修改」预填指令本身会把选中摘录放进引号,
 * 因此与 before 相同/被 before 包含的引号段(含截断省略号)不算替换文本。
 */
function quotedReplacement(instruction: string, before: string): string | null {
  const matches = [...instruction.matchAll(/[「"']([^「」"']{2,400})[」"']/g)].map(
    (match) => match[1],
  );
  for (const candidate of matches.reverse()) {
    const bare = candidate.replace(/…$/, "");
    if (candidate === before || before.includes(bare)) continue;
    return candidate;
  }
  return null;
}

function sentencesOf(value: string): string[] {
  return value
    .split(/(?<=[。!?;\n])/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rewriteTransform(input: BuiltinSkillInput): SkillExecutionResultV1 {
  const quoted = quotedReplacement(input.instruction, input.before);
  if (quoted) return proposalResult(quoted);
  const cleaned = normalizeText(input.before);
  if (cleaned !== input.before) return proposalResult(cleaned);
  // 本地规则无法凭空改写:如实说明,不生成假 AI 提案
  return {
    status: "completed",
    text: `本地规则没法直接改写${input.sectionLabel},还没有接入真实 AI。可以在指令里用「」写出想要的表述,或选择「压缩精简」「强化开头钩子」等有明确规则的技能。`,
  };
}

function compressTransform(input: BuiltinSkillInput): string {
  let text = normalizeText(input.before);
  for (const filler of FILLER_WORDS) {
    text = text.split(filler).join("");
  }
  const sentences = sentencesOf(text);
  if (sentences.length > 2) {
    text = sentences.slice(0, Math.ceil(sentences.length * 0.7)).join("");
  }
  return text;
}

function expandHookTransform(input: BuiltinSkillInput): string {
  const base = normalizeText(input.before);
  const first = sentencesOf(base)[0] ?? base;
  return `先说结论:${first}${base === first ? "" : ` ${base.slice(first.length).trim()}`}`;
}

function visualTransform(input: BuiltinSkillInput): string {
  const base = normalizeText(input.before);
  const suffix =
    input.contentKind === "douyin_video_script"
      ? "(画面建议:主体特写起手,切一个环境交代镜头,字幕与口播逐句同步)"
      : "(视觉建议:首图放大关键词,正文页用留白分隔要点,末页给行动指引)";
  return `${base}${suffix}`;
}

const RISK_MARKERS = ["最", "第一", "绝对", "治愈", "根治", "保证", "百分百", "秒杀", "国家级"];

function riskCheck(input: BuiltinSkillInput): SkillExecutionResultV1 {
  const hits = RISK_MARKERS.filter((marker) => input.before.includes(marker));
  const lines = hits.length
    ? [
        `本地规则检查在${input.sectionLabel}中发现 ${hits.length} 处需要复核的表述:`,
        ...hits.map((hit) => `· 「${hit}」:平台通常限制绝对化/功效性用语,建议改为可验证的描述`),
        "以上为本地关键词规则的协议预览,不能替代平台审核与人工判断。",
      ]
    : [
        `本地规则检查未在${input.sectionLabel}中命中常见的绝对化用语关键词。`,
        "这只是本地关键词规则的协议预览,不能替代平台审核与人工判断。",
      ];
  return { status: "completed", text: lines.join("\n") };
}

function proposalResult(after: string): SkillExecutionResultV1 {
  return {
    status: "completed",
    proposedEffects: [{ type: "content.propose_revision", payload: { after } }],
  };
}

// ---------------------------------------------------------------------------
// 内置注册表(静态白名单)
// ---------------------------------------------------------------------------

const BUILTIN_SKILLS: BuiltinSkillDefinition[] = [
  {
    manifest: manifestOf({
      id: "builtin.rewrite-section",
      name: "改写选中段落",
      description: "按你的指令改写选中的区块;当前为本地规则协议预览。",
      triggers: ["改写", "修改", "换一种说法", "换成", "不像我"],
      capabilities: ["content.read", "content.propose_revision"],
    }),
    composerTemplate: "请改写{section}:",
    execute: rewriteTransform,
  },
  {
    manifest: manifestOf({
      id: "builtin.expand-hook",
      name: "强化开头钩子",
      description: "把开头/钩子改得更抓人;当前为本地规则协议预览。",
      triggers: ["开头", "钩子", "开场", "更抓人", "扩写开头"],
      capabilities: ["content.read", "content.propose_revision"],
    }),
    composerTemplate: "请把{section}的开头改得更抓人:",
    execute: (input) => proposalResult(expandHookTransform(input)),
  },
  {
    manifest: manifestOf({
      id: "builtin.compress-text",
      name: "压缩精简",
      description: "去掉赘词并压缩篇幅;当前为本地规则协议预览。",
      triggers: ["压缩", "精简", "缩短", "太长", "简洁"],
      capabilities: ["content.read", "content.propose_revision"],
    }),
    composerTemplate: "请压缩{section},保留核心信息:",
    execute: (input) => proposalResult(compressTransform(input)),
  },
  {
    manifest: manifestOf({
      id: "builtin.improve-visual",
      name: "优化视觉/分镜建议",
      description: "补充画面与视觉呈现建议;当前为本地规则协议预览。",
      triggers: ["画面", "视觉", "分镜", "镜头", "怎么拍"],
      capabilities: ["content.read", "content.propose_revision"],
    }),
    composerTemplate: "请优化{section}的画面呈现:",
    execute: (input) => proposalResult(visualTransform(input)),
  },
  {
    manifest: manifestOf({
      id: "builtin.risk-check",
      name: "风险与合规检查",
      description: "按本地关键词规则检查绝对化用语等平台风险,不修改内容。",
      triggers: ["风险", "合规", "违禁词", "敏感词", "会不会被限流"],
      capabilities: ["content.read"],
    }),
    composerTemplate: "请检查{section}的平台合规风险:",
    execute: riskCheck,
  },
];

export const DEFAULT_PATCH_SKILL_ID = "builtin.rewrite-section";

export type SkillMenuItem = {
  id: string;
  name: string;
  description: string;
  composerTemplate: string;
};

/** 供 Composer 技能菜单读取的清单(只暴露展示字段,不暴露执行体)。 */
export function listSkillMenuItems(): SkillMenuItem[] {
  return BUILTIN_SKILLS.map((skill) => ({
    id: skill.manifest.id,
    name: skill.manifest.name,
    description: skill.manifest.description,
    composerTemplate: skill.composerTemplate,
  }));
}

export function listSkillManifests(): SkillManifestV1[] {
  return BUILTIN_SKILLS.map((skill) => skill.manifest);
}

export function getSkillManifest(skillId: string): SkillManifestV1 | null {
  return BUILTIN_SKILLS.find((skill) => skill.manifest.id === skillId)?.manifest ?? null;
}

/** 按 manifest triggers 从自然语言指令匹配 Skill;无命中回退到通用改写。 */
export function matchSkillByInstruction(instruction: string): string {
  for (const skill of BUILTIN_SKILLS) {
    if (skill.manifest.triggers.some((trigger) => instruction.includes(trigger))) {
      return skill.manifest.id;
    }
  }
  return DEFAULT_PATCH_SKILL_ID;
}

/**
 * 执行内置 Skill:能力越权即拒绝,输出必须通过 star-skill/v1 结果 schema,
 * 非法/超大输出在这里被拦截,不会进入消息流。
 */
export function executeBuiltinSkill(
  skillId: string,
  input: BuiltinSkillInput,
): SkillExecutionResultV1 {
  const skill = BUILTIN_SKILLS.find((item) => item.manifest.id === skillId);
  if (!skill) throw new Error(`Skill ${skillId} 不在内置注册表中。`);
  assertCapabilitiesAllowed(skill.manifest, GRANTED_BUILTIN_CAPABILITIES);
  const raw = skill.execute(input);
  return skillExecutionResultSchema.parse(raw) as SkillExecutionResultV1;
}

// ---------------------------------------------------------------------------
// RemoteSkillAdapter:接口占位 + fixture,Beta 阶段禁用
// ---------------------------------------------------------------------------

/** 远程 Skill fixture:仅用于协议兼容性测试,不出现在技能菜单中。 */
export const REMOTE_SKILL_FIXTURE: SkillManifestV1 = skillManifestSchema.parse({
  protocol: SKILL_PROTOCOL,
  id: "fixture.remote-echo",
  version: "0.1.0",
  name: "远程回声(fixture)",
  description: "验证 remote manifest 形状的测试夹具;Beta 阶段不可执行。",
  triggers: [],
  inputSchema: PATCH_INPUT_SCHEMA,
  outputSchema: PATCH_OUTPUT_SCHEMA,
  requiredCapabilities: ["content.read"],
  execution: { type: "remote", endpoint: "https://skills.example.com/echo" },
});

/**
 * 远程 Skill 适配器:Beta 阶段一律拒绝执行。
 * 未来开放时在此实现域名白名单、HMAC 签名、超时与输出大小限制,聊天 UI 不变。
 */
export function executeRemoteSkill(manifest: SkillManifestV1): never {
  void manifest;
  throw new Error("远程 Skill 在 Beta 阶段被禁用,只允许内置注册表。");
}
