import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createScheduledWorkflow, listScheduledWorkflows, updateScheduledWorkflow } from "@/lib/services/scheduled-workflow-service";

const createSchema = z.object({
  socialConnectionId: z.string().cuid().optional().nullable(),
  type: z.enum(["hotspot_refresh", "research_digest", "draft_generation", "metrics_collection", "retrospective_prepare"]),
  name: z.string().trim().min(1).max(120),
  schedule: z.string().trim().regex(/^(?:[^\s]+\s+){4}[^\s]+$/).max(100),
  timezone: z.string().trim().min(1).max(100),
  config: z.record(z.unknown()).default({}),
  maxRuns: z.number().int().positive().max(10_000).optional(),
});
const updateSchema = z.object({ workflowId: z.string().cuid(), action: z.enum(["pause", "resume", "archive"]) });
export async function GET() { try { const user = await requireUser(); return ok({ workflows: await listScheduledWorkflows(user.id) }); } catch (error) { return fail(error); } }
export async function POST(request: Request) { try { const user = await requireUser(); const input = createSchema.parse(await request.json()); return ok({ workflow: await createScheduledWorkflow({ userId: user.id, ...input, config: input.config as Prisma.InputJsonValue }) }, 201); } catch (error) { return fail(error); } }
export async function PATCH(request: Request) { try { const user = await requireUser(); const input = updateSchema.parse(await request.json()); return ok({ workflow: await updateScheduledWorkflow({ userId: user.id, ...input }) }); } catch (error) { return fail(error); } }
