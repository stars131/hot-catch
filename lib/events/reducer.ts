import type { StarEventEnvelope } from "@/lib/events/protocol";

export type EventProjection = {
  streamEpoch: string | null;
  lastSeq: number;
  needsReset: boolean;
  messages: Record<string, unknown>;
  runs: Record<string, unknown>;
  jobs: Record<string, unknown>;
  interactions: Record<string, unknown>;
  artifacts: Record<string, unknown>;
  queue: Record<string, unknown>;
  checkpoints: Record<string, unknown>;
};

export const EMPTY_EVENT_PROJECTION: EventProjection = {
  streamEpoch: null,
  lastSeq: 0,
  needsReset: false,
  messages: {}, runs: {}, jobs: {}, interactions: {}, artifacts: {}, queue: {}, checkpoints: {},
};

export function reduceStarEvent(state: EventProjection, event: StarEventEnvelope): EventProjection {
  if ((state.streamEpoch && state.streamEpoch !== event.streamEpoch) || (state.lastSeq > 0 && event.seq !== state.lastSeq + 1)) {
    return { ...state, needsReset: true };
  }
  if (event.seq <= state.lastSeq) return state;
  const payload = asRecord(event.payload);
  const next = { ...state, streamEpoch: event.streamEpoch, lastSeq: event.seq, needsReset: false };
  if (event.type.startsWith("message.")) next.messages = upsert(state.messages, payload.messageId, payload);
  else if (event.type.startsWith("run.")) next.runs = upsert(state.runs, payload.runId, payload);
  else if (event.type === "job.updated") next.jobs = upsert(state.jobs, payload.jobId, payload);
  else if (event.type.startsWith("interaction.")) next.interactions = upsert(state.interactions, payload.interactionId, payload);
  else if (event.type.startsWith("artifact.")) next.artifacts = upsert(state.artifacts, payload.revisionId ?? payload.contentId, payload);
  else if (event.type === "queue.updated") next.queue = upsert(state.queue, payload.turnId, payload);
  else if (event.type === "checkpoint.created") next.checkpoints = upsert(state.checkpoints, payload.segmentId, payload);
  return next;
}

function upsert(collection: Record<string, unknown>, id: unknown, value: Record<string, unknown>) {
  return typeof id === "string" ? { ...collection, [id]: value } : collection;
}
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
