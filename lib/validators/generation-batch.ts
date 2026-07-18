import { z } from "zod";
import {
  CONTENT_LOCALES,
  PLATFORM_IDS,
  PLATFORM_DEFINITIONS,
} from "@/lib/platforms/registry";
import { directionSelectionSchema } from "@/lib/creator/creative-direction";

export const generationBatchSchema = z
  .object({
    brief: z.string().trim().min(1).max(12000),
    directionSelection: directionSelectionSchema.optional(),
    targetPlatforms: z.array(z.enum(PLATFORM_IDS)).min(1).max(5),
    targetLocale: z.enum(CONTENT_LOCALES),
    skillIds: z
      .array(z.string().regex(/^(?:builtin|custom|extension)\.[a-z0-9._-]{2,80}$/))
      .max(8)
      .default([]),
    accountBindings: z.record(z.enum(PLATFORM_IDS), z.string().cuid()).default({}),
  })
  .superRefine((value, ctx) => {
    const unique = new Set(value.targetPlatforms);
    if (unique.size !== value.targetPlatforms.length) {
      ctx.addIssue({
        code: "custom",
        path: ["targetPlatforms"],
        message: "目标平台不能重复。",
      });
    }
    for (const platform of value.targetPlatforms) {
      if (!PLATFORM_DEFINITIONS[platform]) {
        ctx.addIssue({
          code: "custom",
          path: ["targetPlatforms"],
          message: `未注册的平台：${platform}`,
        });
      }
    }
  });

export const generationBatchIdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

type ParsedGenerationBatchInput = z.output<typeof generationBatchSchema>;
export type GenerationBatchInput = Omit<ParsedGenerationBatchInput, "accountBindings"> & {
  accountBindings?: ParsedGenerationBatchInput["accountBindings"];
};
