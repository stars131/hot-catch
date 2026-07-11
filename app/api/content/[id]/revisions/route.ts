import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  createContentRevision,
  restoreContentRevision,
} from "@/lib/services/content-project-service";
import { revisionRequestSchema } from "@/lib/validators/content-project";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = revisionRequestSchema.parse(await request.json());
    // 恢复:payload 由服务端从被选中版本读取,客户端不提交正文
    const revision =
      "fromRevisionId" in input
        ? await restoreContentRevision(user.id, id, input.fromRevisionId)
        : await createContentRevision(user.id, id, input);
    return ok({ revision }, 201);
  } catch (error) {
    return fail(error);
  }
}
