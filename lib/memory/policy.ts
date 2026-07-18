import type { AccountMemory, MemoryScope, MemoryStatus } from "@prisma/client";

const SECRET_PATTERN = /(api[_ -]?key|access[_ -]?token|refresh[_ -]?token|password|cookie|sk-[a-z0-9_-]{12,})/i;
const LOW_SIGNAL_PATTERN = /^(你好|您好|谢谢|感谢|收到|好的|ok|hello|hi)[!！。.\s]*$/i;

export function shouldExtractMemory(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length < 24 || normalized.length > 12_000) return false;
  if (LOW_SIGNAL_PATTERN.test(normalized) || SECRET_PATTERN.test(normalized)) return false;
  return true;
}

export function memoryPriority(memory: Pick<AccountMemory, "scope" | "status">): number {
  if (memory.scope === "account" && memory.status === "approved") return 500;
  if (memory.scope === "global" && memory.status === "approved") return 400;
  if (memory.scope === "account" && memory.status === "candidate") return 220;
  if (memory.scope === "global" && memory.status === "candidate") return 200;
  return 0;
}

export function sortMemoriesByPriority<T extends Pick<AccountMemory, "scope" | "status" | "confidence" | "updatedAt">>(
  memories: readonly T[],
) {
  return [...memories].sort((left, right) => {
    const priority = memoryPriority(right) - memoryPriority(left);
    if (priority) return priority;
    const confidence = right.confidence - left.confidence;
    if (confidence) return confidence;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
}

export function resolveMemoryWeight(scope: MemoryScope, status: MemoryStatus, confidence: number) {
  const base = status === "approved" ? 1 : status === "candidate" ? 0.25 : 0;
  const scopeBoost = scope === "account" ? 1 : 0.85;
  return Math.max(0, Math.min(1, base * scopeBoost * confidence));
}
