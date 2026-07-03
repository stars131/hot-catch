import { addMessage } from "@/lib/services/conversation-service";
import { fetchAndSaveXhs } from "@/lib/xhs/xhs-fetch-service";
import { analyzeAccounts } from "@/lib/services/analysis-service";
import { generateContent } from "@/lib/services/content-service";
import { parseIntent } from "@/lib/intent";
import type { Prisma } from "@prisma/client";

export async function handleChatMessage(params: {
  userId: string;
  conversationId: string;
  message: string;
  selectedPersonaId?: string | null;
  selectedBenchmarkAccountIds?: string[];
}) {
  await addMessage({
    conversationId: params.conversationId,
    role: "user",
    content: params.message,
  });

  const parsed = parseIntent(params.message);
  let assistantText = "";
  let artifact: Prisma.InputJsonValue | undefined;

  if (parsed.intent === "add_benchmark_account") {
    const result = await fetchAndSaveXhs({
      userId: params.userId,
      input: parsed.subject,
    });
    assistantText =
      result.status === "success" && result.account
        ? `Added benchmark account: ${result.account.nickname ?? result.account.xhsId ?? result.accountId}.`
        : result.errorMessage ?? "I need manual account details to continue.";
    artifact = result as unknown as Prisma.InputJsonValue;
  } else if (parsed.intent === "analyze_account" || parsed.intent === "generate_report") {
    const accountIds = params.selectedBenchmarkAccountIds ?? [];
    if (!accountIds.length) {
      assistantText = "Select at least one benchmark account, then ask me to analyze it.";
    } else {
      const result = await analyzeAccounts({
        userId: params.userId,
        accountIds,
        personaId: params.selectedPersonaId,
      });
      assistantText = result.report;
      artifact = result as unknown as Prisma.InputJsonValue;
    }
  } else if (parsed.intent === "generate_content") {
    const result = await generateContent({
      userId: params.userId,
      inputType: "topic",
      inputText: parsed.subject,
      personaId: params.selectedPersonaId,
      benchmarkAccountIds: params.selectedBenchmarkAccountIds ?? [],
      conversationId: params.conversationId,
    });
    assistantText = result.markdown;
    artifact = result as unknown as Prisma.InputJsonValue;
  } else {
    assistantText =
      "I can help you add benchmark XHS accounts, analyze patterns, and turn a topic into a post draft. Try `/add-account mock_creator`, `/analyze`, or `/content your topic`.";
  }

  await addMessage({
    conversationId: params.conversationId,
    role: "assistant",
    content: assistantText,
    metadata: artifact,
  });

  return {
    conversationId: params.conversationId,
    intent: parsed.intent,
    message: assistantText,
    artifact,
  };
}
