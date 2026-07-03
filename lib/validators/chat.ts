import { z } from "zod";
import { env } from "@/lib/env";

export const chatRequestSchema = z.object({
  conversationId: z.string().cuid().optional(),
  message: z.string().trim().min(1, "Message is required").max(env.MAX_INPUT_LENGTH),
  selectedPersonaId: z.string().cuid().optional().nullable(),
  selectedBenchmarkAccountIds: z.array(z.string().cuid()).optional().default([]),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const intentParseSchema = z.object({
  text: z.string().trim().min(1).max(env.MAX_INPUT_LENGTH),
});
