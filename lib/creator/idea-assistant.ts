import { createHash } from "node:crypto";
import { z } from "zod";
import type { IdeaCandidatesCard } from "@/lib/creator/chat-protocol";
import type { UiLocale } from "@/lib/platforms/registry";
import { createLlmProvider } from "@/lib/providers/factory";
import type {
  DirectionSelection,
  DirectionSnapshot,
} from "@/lib/creator/creative-direction";

const ideaOutputSchema = z
  .object({
    candidates: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(160),
            angle: z.string().trim().min(1).max(800),
            audience: z.string().trim().min(1).max(300),
            reason: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .min(3)
      .max(5),
  })
  .strict();

export const IDEA_CANDIDATE_PROMPT_VERSION = "idea-candidates/v2";

export function buildIdeaCandidateSystem(
  locale: UiLocale,
  directionSnapshot?: DirectionSnapshot,
) {
  const zh = locale === "zh-CN";
  const role = zh
    ? "你是内容选题编辑。根据用户主题和已确认的表达方向，提出 3 个彼此明显不同、可以真实创作的选题。"
    : "You are a content commissioning editor. Propose 3 clearly distinct, publishable ideas from the user's brief and confirmed direction.";
  const languageRule = zh
    ? "所有面向用户的字符串使用简体中文。"
    : "Write every user-facing string in English.";
  return [
    role,
    languageRule,
    `Only return one JSON object. Do not use Markdown or add fields. Use this exact contract:
{
  "candidates": [
    {
      "title": "specific publishable idea title",
      "angle": "distinct framing and what the content will cover",
      "audience": "specific target audience",
      "reason": "why this idea is useful and fits the brief"
    },
    {
      "title": "second distinct idea title",
      "angle": "second distinct framing",
      "audience": "specific target audience",
      "reason": "why this idea is worth making"
    },
    {
      "title": "third distinct idea title",
      "angle": "third distinct framing",
      "audience": "specific target audience",
      "reason": "why this idea is worth making"
    }
  ]
}`,
    "Return exactly 3 candidates. Each candidate must contain only title, angle, audience and reason, and every field must be a non-empty string.",
    zh
      ? "不要捏造事实、数据、经历、热点或凭证。必须逐项遵守用户主题中的禁止项和硬边界。三个选题必须在内容切口上真正不同，而不是只改标题。"
      : "Do not invent facts, data, experiences, trends or credentials. Preserve every prohibition and hard boundary in the user's brief. The three ideas must differ in substance, not only in title wording.",
    directionSnapshot ? directionPrompt(directionSnapshot, zh) : "",
  ].filter(Boolean).join("\n");
}

export async function generateIdeaCandidatesCard(params: {
  userId: string;
  brief: string;
  direction: string;
  directionSelection?: DirectionSelection;
  directionSnapshot?: DirectionSnapshot;
  uiLocale: UiLocale;
  nonce: string;
}): Promise<IdeaCandidatesCard> {
  const provider = await createLlmProvider(params.userId);
  const zh = params.uiLocale === "zh-CN";
  const output = await provider.generateStructured({
    system: buildIdeaCandidateSystem(params.uiLocale, params.directionSnapshot),
    prompt: zh
      ? `用户主题：\n${params.brief}\n\n表达方向：${params.direction}`
      : `User brief:\n${params.brief}\n\nDirection: ${params.direction}`,
    schema: ideaOutputSchema,
    temperature: 0.65,
  });
  const digest = createHash("sha256")
    .update(params.nonce)
    .digest("hex")
    .slice(0, 16);

  return {
    id: `card-ideas-${digest}`,
    version: 1,
    type: "idea_candidates",
    brief: params.brief,
    direction: params.direction,
    ...(params.directionSelection ? { directionSelection: params.directionSelection } : {}),
    ...(params.directionSnapshot ? {
      primaryDirectionLabel: zh
        ? params.directionSnapshot.primary.labels.zhCN
        : params.directionSnapshot.primary.labels.enUS,
      ...(params.directionSnapshot.secondary ? {
        secondaryDirectionLabel: zh
          ? params.directionSnapshot.secondary.labels.zhCN
          : params.directionSnapshot.secondary.labels.enUS,
      } : {}),
    } : {}),
    uiLocale: params.uiLocale,
    candidates: output.candidates.slice(0, 5).map((candidate, index) => ({
      id: `idea-candidate-${index + 1}`,
      ...candidate,
    })),
    chooseAction: {
      actionId: "idea.choose",
      label: zh ? "选择这个选题" : "Choose this idea",
      appearance: "primary",
    },
    skipAction: {
      actionId: "idea.skip",
      label: zh ? "跳过选题，直接设置创作" : "Skip ideas and configure creation",
      appearance: "ghost",
    },
  };
}

export function buildSelectedIdeaBrief(params: {
  originalBrief: string;
  direction: string;
  uiLocale: UiLocale;
  candidate: {
    title: string;
    angle: string;
    audience: string;
    reason: string;
  };
}) {
  const zh = params.uiLocale === "zh-CN";
  return [
    zh ? `原始需求（所有约束继续生效）：\n${params.originalBrief}` : `Original request (all constraints remain active):\n${params.originalBrief}`,
    zh ? `选中的选题：${params.candidate.title}` : `Selected idea: ${params.candidate.title}`,
    zh ? `选题切口：${params.candidate.angle}` : `Idea angle: ${params.candidate.angle}`,
    zh ? `表达方向：${params.direction}` : `Direction: ${params.direction}`,
    zh ? `目标受众：${params.candidate.audience}` : `Audience: ${params.candidate.audience}`,
    zh ? `创作理由：${params.candidate.reason}` : `Why this idea: ${params.candidate.reason}`,
  ].join("\n");
}

function directionPrompt(snapshot: DirectionSnapshot, zh: boolean) {
  const primary = snapshot.primary;
  const secondary = snapshot.secondary;
  return [
    zh ? `主方向规则：${primary.generation.primaryInstruction}` : `Primary direction rules: ${primary.generation.primaryInstruction}`,
    zh ? `证据边界：${primary.evidence.policy}` : `Evidence policy: ${primary.evidence.policy}`,
    secondary
      ? (zh ? `辅方向规则：${secondary.generation.secondaryInstruction}` : `Secondary direction rules: ${secondary.generation.secondaryInstruction}`)
      : "",
  ].filter(Boolean).join("\n");
}
