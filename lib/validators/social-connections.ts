import { z } from "zod";
import { PLATFORM_IDS } from "@/lib/platforms/registry";

export const createManualConnectionSchema = z.object({
  platform: z.enum(PLATFORM_IDS),
  displayName: z.string().trim().min(1).max(120),
  handle: z.string().trim().max(120).optional().nullable(),
  avatarUrl: z.string().url().max(2048).optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const updateConnectionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    id: z.string().cuid(),
    displayName: z.string().trim().min(1).max(120).optional(),
    handle: z.string().trim().max(120).optional().nullable(),
    avatarUrl: z.string().url().max(2048).optional().nullable(),
    isDefault: z.boolean().optional(),
  }),
  z.object({ action: z.literal("archive"), id: z.string().cuid() }),
  z.object({
    action: z.literal("merge"),
    id: z.string().cuid(),
    targetConnectionId: z.string().cuid(),
  }),
]);
