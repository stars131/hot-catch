export const EVENT_PROTOCOL = "star-event/v1" as const;

export const CONVERSATION_EVENT_TYPES = [
  "message.created",
  "message.updated",
  "run.created",
  "run.updated",
  "job.updated",
  "interaction.created",
  "interaction.updated",
  "artifact.created",
  "artifact.updated",
  "queue.updated",
  "checkpoint.created",
] as const;

export type ConversationEventType = (typeof CONVERSATION_EVENT_TYPES)[number];

export type StarEventEnvelope = {
  protocol: typeof EVENT_PROTOCOL;
  conversationId: string;
  seq: number;
  streamEpoch: string;
  type: ConversationEventType;
  payload: unknown;
  createdAt: string;
};
