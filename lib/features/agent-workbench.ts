export const AGENT_WORKBENCH_FLAGS = {
  accountPersonas: flag("FEATURE_ACCOUNT_PERSONAS", true),
  eventStream: flag("FEATURE_AGENT_EVENT_STREAM", true),
  longConversations: flag("FEATURE_LONG_CONVERSATIONS", true),
  memoryAndExtensions: flag("FEATURE_AGENT_MEMORY_SKILLS", true),
  artifactWorkspace: flag("FEATURE_ARTIFACT_WORKSPACE", true),
  cloudAutomation: flag("FEATURE_CLOUD_AUTOMATION", true),
} as const;

function flag(name: string, fallback: boolean) {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}
