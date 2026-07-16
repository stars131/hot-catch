import { registerJobHandler } from "@/lib/jobs/handlers";
import type { JobHandler } from "@/lib/jobs/types";
import { synchronizeTrackedPublication } from "@/lib/tracking/tracking-service";

const trackingHandler: JobHandler = async (payload, reportProgress) => {
  const input = payload.input as { trackedPublicationId?: string };
  if (!input.trackedPublicationId) throw new Error("Tracking job input is incomplete");
  await reportProgress(15, "验证作品与用户归属");
  const result = await synchronizeTrackedPublication(
    payload.userId,
    input.trackedPublicationId,
  );
  await reportProgress(result.finalStatus === "waiting_input" ? 50 : 95, "保存真实指标快照");
  return {
    finalStatus: result.finalStatus,
    resultType: "trackedPublication",
    resultId: input.trackedPublicationId,
  };
};

registerJobHandler("tracking.sync", trackingHandler);
