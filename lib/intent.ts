import { mapCommandToIntent, stripCommand, type ChatIntent } from "@/lib/constants/commands";
import { resolveXhsInput } from "@/lib/xhs/resolver";

export type ParsedIntent = {
  intent: ChatIntent;
  subject: string;
};

export function parseIntent(text: string): ParsedIntent {
  const trimmed = text.trim();
  const commandIntent = mapCommandToIntent(trimmed);
  const subject = stripCommand(trimmed) || trimmed;

  if (resolveXhsInput(subject)) {
    return { intent: "add_benchmark_account", subject };
  }

  return { intent: commandIntent, subject };
}
