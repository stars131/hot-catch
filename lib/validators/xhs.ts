import { z } from "zod";

export const resolveInputSchema = z.object({
  input: z.string().trim().min(1, "Input is required").max(500),
});

export const fetchAccountSchema = z.object({
  input: z.string().trim().min(1).max(500),
});

export const fetchNoteSchema = z.object({
  url: z.string().trim().min(1).max(500),
});

export type ResolveInputRequest = z.infer<typeof resolveInputSchema>;
export type FetchAccountRequest = z.infer<typeof fetchAccountSchema>;
export type FetchNoteRequest = z.infer<typeof fetchNoteSchema>;
