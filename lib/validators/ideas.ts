import { Platform } from "@prisma/client";
import { z } from "zod";

export const createIdeaSchema = z.object({
  source: z.enum(["hotspot", "manual", "reference"]).default("manual"),
  platform: z.nativeEnum(Platform).optional(),
  title: z.string().trim().min(1).max(200),
  angle: z.string().trim().max(2000).optional(),
  audience: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(5000).optional(),
  hotspot: z
    .object({
      id: z.string().trim().min(1).max(300),
      category: z.string().trim().max(100).optional(),
      heat: z.number().finite().optional(),
      rank: z.number().int().positive().optional(),
      source: z.string().trim().max(100).optional(),
      sourceUrl: z.string().url().max(2000).optional(),
      keywords: z.array(z.string().trim().max(100)).max(30).optional(),
      evidence: z.unknown().optional(),
    })
    .optional(),
});

export const updateIdeaSchema = z.object({
  status: z.enum(["saved", "planning", "creating", "published", "archived"]).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  angle: z.string().trim().max(2000).nullable().optional(),
  audience: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
});
