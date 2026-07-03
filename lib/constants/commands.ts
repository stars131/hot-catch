export type ChatIntent =
  | "add_benchmark_account"
  | "analyze_account"
  | "generate_report"
  | "generate_advice"
  | "generate_content"
  | "optimize_content"
  | "configure_persona"
  | "general_chat";

export type ChatCommand = {
  command: string;
  description: string;
  intent: ChatIntent;
};

export const CHAT_COMMANDS: ChatCommand[] = [
  {
    command: "/persona",
    description: "Create or update the creator persona.",
    intent: "configure_persona",
  },
  {
    command: "/add-account",
    description: "Add an XHS account, profile URL, or note URL.",
    intent: "add_benchmark_account",
  },
  {
    command: "/analyze",
    description: "Analyze saved benchmark accounts.",
    intent: "analyze_account",
  },
  {
    command: "/report",
    description: "Generate a benchmark report.",
    intent: "generate_report",
  },
  {
    command: "/advice",
    description: "Generate learning advice.",
    intent: "generate_advice",
  },
  {
    command: "/content",
    description: "Generate an XHS graphic-post draft.",
    intent: "generate_content",
  },
  {
    command: "/optimize-title",
    description: "Optimize current title options.",
    intent: "optimize_content",
  },
  {
    command: "/optimize-body",
    description: "Optimize current body copy.",
    intent: "optimize_content",
  },
];

export function mapCommandToIntent(text: string): ChatIntent {
  const trimmed = text.trim();
  const cmd = trimmed.split(/\s+/)[0];
  const found = CHAT_COMMANDS.find((c) => c.command === cmd);
  if (found) return found.intent;

  if (/optimi[sz]e|优化/.test(trimmed)) return "optimize_content";
  if (/persona|人设/.test(trimmed)) return "configure_persona";
  if (/analy[sz]e|分析/.test(trimmed)) return "analyze_account";
  if (/report|报告/.test(trimmed)) return "generate_report";
  if (/advice|建议/.test(trimmed)) return "generate_advice";
  if (/content|draft|generate|图文|生成|写/.test(trimmed)) {
    return "generate_content";
  }
  if (/xhs|xiaohongshu|小红书|对标|账号|主页|笔记/.test(trimmed)) {
    return "add_benchmark_account";
  }

  return "general_chat";
}

export function stripCommand(text: string): string {
  const trimmed = text.trim();
  const found = CHAT_COMMANDS.find((c) => trimmed.startsWith(c.command));
  if (found) return trimmed.slice(found.command.length).trim();
  return trimmed.replace(/^\/\S+\s*/, "").trim();
}
