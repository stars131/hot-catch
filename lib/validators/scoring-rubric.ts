import { ContentKind, Platform } from "@prisma/client";
import { z } from "zod";

export const createScoringRubricSchema = z.object({
  platform: z.nativeEnum(Platform),
  contentKind: z.nativeEnum(ContentKind),
  name: z.string().trim().min(1).max(200),
  rules: z.record(z.string(), z.unknown()),
});

export const activateScoringRubricSchema = z.object({
  confirmed: z.literal(true),
  backtestResult: z.object({
    sampleSize: z.number().int().min(3),
    previousScore: z.number().min(0),
    candidateScore: z.number().min(0),
    notes: z.string().max(5000).optional(),
  }),
});
