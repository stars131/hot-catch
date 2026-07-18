import type { SkillCatalogItem } from "@/lib/skills/catalog";

export type ApprovedExtensionManifest = {
  protocol: "star-skill-extension/v1";
  id: `extension.${string}`;
  name: string;
  description: string;
  version: string;
  scopes: Array<"generation" | "patch">;
  instructions: string;
  capabilities: Array<"read_context" | "shape_output" | "compliance_check">;
  reviewedBy: string;
  reviewedAt: string;
};

/** Administrator-reviewed declarative manifests. No code or remote endpoints. */
export const APPROVED_EXTENSION_MANIFESTS: readonly ApprovedExtensionManifest[] = [
  {
    protocol: "star-skill-extension/v1",
    id: "extension.evidence-first",
    name: "证据优先表达",
    description: "把事实、推断和个人经验分层，避免把参考信息写成未经验证的结论。",
    version: "1.0.0",
    scopes: ["generation"],
    instructions: "区分已知事实、合理推断与个人经验。没有来源的数字和结论不得写成确定事实；必要时明确说明限制条件。",
    capabilities: ["read_context", "shape_output", "compliance_check"],
    reviewedBy: "startrace-admin",
    reviewedAt: "2026-07-17",
  },
];

export function listApprovedExtensionSkills(disabledIds: readonly string[] = []): SkillCatalogItem[] {
  const disabled = new Set(disabledIds);
  return APPROVED_EXTENSION_MANIFESTS.map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    source: "extension",
    scopes: manifest.scopes,
    enabled: !disabled.has(manifest.id),
    instructions: manifest.instructions,
    composerTemplate: null,
    updatedAt: manifest.version,
  }));
}

export function isApprovedExtensionSkillId(skillId: string) {
  return APPROVED_EXTENSION_MANIFESTS.some((manifest) => manifest.id === skillId);
}
