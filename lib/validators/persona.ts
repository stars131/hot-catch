import { z } from "zod";

export const personaSchema = z.object({
  id: z.string().cuid().optional(),
  name: z.string().max(100).optional().nullable(),
  accountName: z.string().max(100).optional().nullable(),
  niche: z.string().max(200).optional().nullable(),
  creatorIdentity: z.string().max(200).optional().nullable(),
  targetAudience: z.string().max(500).optional().nullable(),
  contentStyle: z.string().max(500).optional().nullable(),
  learningAccounts: z.string().max(1000).optional().nullable(),
  avoidTopics: z.string().max(1000).optional().nullable(),
  businessGoal: z.string().max(500).optional().nullable(),
  ageStage: z.string().max(50).optional().nullable(),
  city: z.string().max(50).optional().nullable(),
  accountStatus: z.string().max(100).optional().nullable(),
  followerCount: z.coerce.number().int().nonnegative().optional().nullable(),
  updateFrequency: z.string().max(100).optional().nullable(),
  monetizationType: z.string().max(200).optional().nullable(),
  personalExperience: z.string().max(2000).optional().nullable(),
  expressionBoundary: z.string().max(1000).optional().nullable(),
  forbiddenTopics: z.string().max(1000).optional().nullable(),
  valuesKeywords: z.string().max(500).optional().nullable(),
  commonPhrases: z.string().max(500).optional().nullable(),
  accountGoal: z.string().max(500).optional().nullable(),
  personalStrengths: z.string().max(1000).optional().nullable(),
  personalWeaknesses: z.string().max(1000).optional().nullable(),
  sustainableTopics: z.string().max(1000).optional().nullable(),
  isDefault: z.boolean().optional(),
  socialConnectionId: z.string().cuid().optional().nullable(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  source: z.enum(["manual", "imported", "memory_assisted"]).optional(),
  previousVersionId: z.string().cuid().optional().nullable(),
});

export const personaVersionActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate"), personaId: z.string().cuid() }),
  z.object({ action: z.literal("archive"), personaId: z.string().cuid() }),
  z.object({
    action: z.literal("copy"),
    personaId: z.string().cuid(),
    socialConnectionId: z.string().cuid().optional().nullable(),
  }),
]);

export type PersonaInput = z.infer<typeof personaSchema>;
