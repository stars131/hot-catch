import { createHash } from "node:crypto";
import { JobType } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { enqueueJob } from "@/lib/jobs/queues";

export const runtime = "nodejs";
const schema = z.object({ noteId: z.string().cuid() });

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const idempotencyKey = createHash("sha256")
      .update(`${user.id}:transcribe:${input.noteId}`)
      .digest("hex");
    const job = await enqueueJob({
      userId: user.id,
      type: JobType.ingest,
      action: "transcription.run",
      input,
      idempotencyKey,
    });
    return ok({ jobId: job.id, status: job.status }, 202);
  } catch (error) {
    return fail(error);
  }
}
