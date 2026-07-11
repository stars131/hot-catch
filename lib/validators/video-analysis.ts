import { z } from "zod";

export const videoAnalysisSchema = z.object({
  scriptType: z.string().min(1).max(100),
  opening: z.object({ text: z.string(), technique: z.string(), effectiveness: z.string() }),
  highlights: z.array(z.object({ description: z.string(), reason: z.string() })).min(1),
  emotionalArc: z.array(z.object({ stage: z.string(), emotion: z.string(), evidence: z.string() })).min(1),
  visualImpression: z.array(z.string()).min(1),
  personaRole: z.string().min(1),
  pacing: z.string().min(1),
  improvementSuggestions: z.array(z.string()).min(1),
  riskNotes: z.array(z.string()),
});
