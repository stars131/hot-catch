import type { Prisma } from "@prisma/client";
import { createMemoryCandidate } from "@/lib/services/memory-service";

export type CloudHookEvent =
  | "generation.before"
  | "generation.after"
  | "publish.before"
  | "publish.after"
  | "metrics.after";

export type CloudHookContext = {
  userId: string;
  socialConnectionId?: string | null;
  conversationId?: string | null;
  contentId?: string | null;
  sourceText?: string | null;
  payload?: Prisma.JsonValue | Prisma.InputJsonValue;
};

type CloudHook = {
  id: string;
  event: CloudHookEvent;
  run(context: CloudHookContext): Promise<void>;
};

const hooks: readonly CloudHook[] = [
  {
    id: "memory.extract-creation-preference",
    event: "generation.after",
    async run(context) {
      if (!context.sourceText) return;
      await createMemoryCandidate({
        userId: context.userId,
        socialConnectionId: context.socialConnectionId,
        kind: "preference",
        title: "创作要求候选",
        body: context.sourceText,
        confidence: 0.45,
        sourceType: "generated_content",
        sourceId: context.contentId ?? undefined,
        sourceExcerpt: context.sourceText,
      });
    },
  },
];

export async function runCloudHooks(event: CloudHookEvent, context: CloudHookContext) {
  for (const hook of hooks) {
    if (hook.event === event) await hook.run(context);
  }
}

export function listCloudHooks() {
  return hooks.map(({ id, event }) => ({ id, event }));
}
