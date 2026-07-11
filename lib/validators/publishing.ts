import { Platform } from "@prisma/client";
import { z } from "zod";

export const aitoearnAuthSchema = z.object({ platform: z.nativeEnum(Platform) });
export const aitoearnAuthStatusSchema = z.object({
  platform: z.nativeEnum(Platform),
  sessionId: z.string().trim().min(1).max(500),
});

export const signAssetSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().regex(/^(image|video)\/[a-zA-Z0-9.+-]+$/),
  size: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
});

export const confirmAssetSchema = z.object({ assetId: z.string().trim().min(1).max(500) });

export const createPublishFlowSchema = z.object({
  contentId: z.string().cuid(),
  revisionId: z.string().cuid().optional(),
  accountId: z.string().trim().min(1).max(500),
  scheduledAt: z.string().datetime().optional(),
  assets: z
    .array(
      z.object({
        url: z.string().url().max(4000),
        type: z.enum(["image", "video"]),
      }),
    )
    .min(1)
    .max(20),
  coverUrl: z.string().url().max(4000).optional(),
  option: z.record(z.string(), z.unknown()).optional(),
});
