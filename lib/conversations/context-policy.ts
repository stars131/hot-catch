export const CONTEXT_COMPRESSION_THRESHOLD = 0.7;
export const CONTEXT_COMPRESSION_TARGET = 0.45;
export const MIN_RECENT_MESSAGES = 12;

export function estimateTokens(text: string) {
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk / 1.6 + other / 4);
}

export function contextUsage(totalTokens: number, contextWindow: number) {
  const safeWindow = Math.max(contextWindow, 1);
  return {
    tokens: totalTokens,
    contextWindow: safeWindow,
    ratio: Math.min(totalTokens / safeWindow, 1),
    shouldCompress: totalTokens / safeWindow >= CONTEXT_COMPRESSION_THRESHOLD,
  };
}

export function selectMessagesForCompression<T extends { content: string }>(
  messages: readonly T[],
  contextWindow: number,
) {
  const tokenCounts = messages.map((message) => estimateTokens(message.content));
  const total = tokenCounts.reduce((sum, count) => sum + count, 0);
  if (total / contextWindow < CONTEXT_COMPRESSION_THRESHOLD || messages.length <= MIN_RECENT_MESSAGES) {
    return { compress: [] as T[], retained: [...messages], totalTokens: total };
  }
  const protectedIndex = Math.max(0, messages.length - MIN_RECENT_MESSAGES);
  let retainedTokens = total;
  let split = 0;
  while (split < protectedIndex && retainedTokens > contextWindow * CONTEXT_COMPRESSION_TARGET) {
    retainedTokens -= tokenCounts[split];
    split += 1;
  }
  return { compress: messages.slice(0, split), retained: messages.slice(split), totalTokens: total };
}
