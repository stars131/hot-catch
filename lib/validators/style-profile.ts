import { Platform } from "@prisma/client";
import { z } from "zod";

export const buildStyleProfileSchema = z.object({
  platform: z.nativeEnum(Platform),
  name: z.string().trim().min(1).max(120),
  noteIds: z.array(z.string().cuid()).min(5).max(20),
});

export const updateStyleProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["draft", "in_review", "approved", "archived"]).optional(),
  summary: z.string().max(10000).nullable().optional(),
  themes: z.unknown().optional(),
  hooks: z.unknown().optional(),
  pacing: z.unknown().optional(),
  tone: z.unknown().optional(),
  visualLanguage: z.unknown().optional(),
  boundaries: z.unknown().optional(),
});

export const styleAnalysisOutputSchema = z.object({
  summary: z.string().min(20).max(5000),
  themes: z.array(z.object({ label: z.string(), description: z.string(), confidence: z.number().min(0).max(1) })).min(1),
  hooks: z.array(z.object({ pattern: z.string(), useWhen: z.string(), confidence: z.number().min(0).max(1) })).min(1),
  pacing: z.object({ description: z.string(), patterns: z.array(z.string()) }),
  tone: z.object({ description: z.string(), traits: z.array(z.string()) }),
  visualLanguage: z.object({ description: z.string(), traits: z.array(z.string()) }),
  boundaries: z.array(z.object({ rule: z.string(), reason: z.string() })).min(1),
  confidence: z.number().min(0).max(1),
  evidence: z
    .array(
      z.object({
        noteId: z.string(),
        dimension: z.enum(["theme", "hook", "pacing", "tone", "visual", "boundary"]),
        excerpt: z.string().max(1000).optional(),
        insight: z.string().min(5).max(1000),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(3),
});
