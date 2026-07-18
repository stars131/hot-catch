import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { listMemories, replaceMemory, reviewMemory } from "@/lib/services/memory-service";

const reviewSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["accept", "reject", "archive"]), memoryId: z.string().cuid(), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("replace"), memoryId: z.string().cuid(), title: z.string().trim().min(1).max(160), body: z.string().trim().min(1).max(5000), reason: z.string().max(500).optional() }),
]);

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const account = request.nextUrl.searchParams.get("socialConnectionId");
    const rawStatus = request.nextUrl.searchParams.get("status");
    const status = rawStatus && ["candidate", "approved", "rejected", "archived"].includes(rawStatus)
      ? rawStatus as "candidate" | "approved" | "rejected" | "archived"
      : undefined;
    return ok({ memories: await listMemories({
      userId: user.id,
      socialConnectionId: account === "global" ? null : account ?? undefined,
      status,
      query: request.nextUrl.searchParams.get("q") ?? undefined,
    }) });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = reviewSchema.parse(await request.json());
    const memory = input.action === "replace"
      ? await replaceMemory({ userId: user.id, memoryId: input.memoryId, title: input.title, body: input.body, reason: input.reason })
      : await reviewMemory({ userId: user.id, memoryId: input.memoryId, action: input.action, reason: input.reason });
    return ok({ memory });
  } catch (error) {
    return fail(error);
  }
}
