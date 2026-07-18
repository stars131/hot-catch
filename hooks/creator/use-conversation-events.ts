"use client";

import { useEffect, useRef } from "react";
import type { StarEventEnvelope } from "@/lib/events/protocol";

export function useConversationEvents(
  conversationId: string | null,
  onEvent: (event: StarEventEnvelope | { type: "reset" }) => void,
) {
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    if (!conversationId) return;
    const storageKey = `startrace:event-cursor:${conversationId}`;
    const saved = readCursor(storageKey);
    const params = new URLSearchParams({ afterSeq: String(saved.seq) });
    if (saved.epoch) params.set("epoch", saved.epoch);
    const source = new EventSource(`/api/conversations/${conversationId}/events?${params}`);

    source.addEventListener("ready", (raw) => {
      const data = JSON.parse((raw as MessageEvent).data) as { streamEpoch: string; latestSeq: number };
      writeCursor(storageKey, { epoch: data.streamEpoch, seq: saved.seq });
    });
    source.addEventListener("event", (raw) => {
      const event = JSON.parse((raw as MessageEvent).data) as StarEventEnvelope;
      writeCursor(storageKey, { epoch: event.streamEpoch, seq: event.seq });
      callbackRef.current(event);
    });
    source.addEventListener("reset", () => {
      localStorage.removeItem(storageKey);
      callbackRef.current({ type: "reset" });
      source.close();
    });
    return () => source.close();
  }, [conversationId]);
}

function readCursor(key: string): { epoch: string | null; seq: number } {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as { epoch?: unknown; seq?: unknown } | null;
    return { epoch: typeof value?.epoch === "string" ? value.epoch : null, seq: typeof value?.seq === "number" ? value.seq : 0 };
  } catch { return { epoch: null, seq: 0 }; }
}

function writeCursor(key: string, value: { epoch: string | null; seq: number }) {
  localStorage.setItem(key, JSON.stringify(value));
}
