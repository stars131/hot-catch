import { createHash } from "node:crypto";
import { z } from "zod";
import type { IdeaCandidatesCard } from "@/lib/creator/chat-protocol";
import type { UiLocale } from "@/lib/platforms/registry";
import { createLlmProvider } from "@/lib/providers/factory";

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

export async function generateIdeaCandidatesCard(params: {
  userId: string;
  brief: string;
  direction: string;
  uiLocale: UiLocale;
  nonce: string;
}): Promise<IdeaCandidatesCard> {
  const provider = await createLlmProvider(params.userId);
  const zh = params.uiLocale === "zh-CN";
  const output = await provider.generateStructured({
    system: [
      zh
        ? "你是内容选题编辑。根据用户提供的主题和表达方向，提出 3 个彼此明显不同、可以真实创作的选题。"
        : "You are a content commissioning editor. Propose 3 clearly distinct, publishable ideas from the user's brief and chosen direction.",
      zh
        ? "不要捏造事实、数据、经历或热点。每个选题必须写清目标受众、独特切口和为什么值得做。只返回符合 Schema 的 JSON。"
        : "Do not invent facts, data, experiences or trends. Each idea must define an audience, a distinct angle and why it is worth making. Return only schema-valid JSON.",
    ].join("\n"),
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
