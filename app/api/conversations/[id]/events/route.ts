import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getEventStreamState,
  listConversationEvents,
  toEnvelope,
} from "@/lib/events/event-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const requestedEpoch = request.nextUrl.searchParams.get("epoch");
  const rawAfterSeq = Number(request.nextUrl.searchParams.get("afterSeq") ?? 0);
  const afterSeq = Number.isSafeInteger(rawAfterSeq) && rawAfterSeq >= 0 ? rawAfterSeq : 0;
  const initial = await getEventStreamState(user.id, id);
  if (!initial) return new Response("Not found", { status: 404 });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor = afterSeq;
      let heartbeatAt = Date.now();
      const send = (event: string, data: unknown, id?: number) => {
        controller.enqueue(
          encoder.encode(`${id ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      if (
        (requestedEpoch && requestedEpoch !== initial.streamEpoch) ||
        (cursor > 0 && cursor < initial.oldestSeq - 1)
      ) {
        send("reset", {
          reason: requestedEpoch !== initial.streamEpoch ? "epoch_changed" : "event_gap",
          streamEpoch: initial.streamEpoch,
          latestSeq: initial.lastEventSeq,
        });
        controller.close();
        return;
      }

      send("ready", {
        streamEpoch: initial.streamEpoch,
        latestSeq: initial.lastEventSeq,
      });

      while (!request.signal.aborted) {
        const events = await listConversationEvents({
          userId: user.id,
          conversationId: id,
          afterSeq: cursor,
        });
        for (const event of events) {
          cursor = event.seq;
          send("event", toEnvelope(event), event.seq);
        }
        if (Date.now() - heartbeatAt >= 15_000) {
          send("heartbeat", { seq: cursor, at: new Date().toISOString() });
          heartbeatAt = Date.now();
        }
        await new Promise((resolve) => setTimeout(resolve, events.length ? 100 : 750));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
