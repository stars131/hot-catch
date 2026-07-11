"use client";

import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NoticeCard as NoticeCardType } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

const TONE = {
  info: { icon: Info, ring: "border-[#DDD7CE]", accent: "text-[#67625A]" },
  warning: { icon: AlertTriangle, ring: "border-[#D9A441]/50", accent: "text-[#8A6414]" },
  error: { icon: XCircle, ring: "border-[#C83B32]/50", accent: "text-[#C83B32]" },
  success: { icon: CheckCircle2, ring: "border-[#4A7C59]/50", accent: "text-[#4A7C59]" },
} as const;

export function NoticeCardView(props: {
  card: NoticeCardType;
  state: CardInvokeState;
  processedActionIds: string[];
  onInvoke: (actionId: string) => void;
}) {
  const tone = TONE[props.card.tone];
  const Icon = tone.icon;
  return (
    <div
      className={cn("mt-2 max-w-md rounded-xl border bg-[#FFFDF9] p-3.5", tone.ring)}
      data-testid={`card-notice-${props.card.id}`}
      data-state={props.state.phase}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone.accent)} />
        <div className="min-w-0">
          <p className="text-sm font-medium">{props.card.title}</p>
          {props.card.body ? (
            <p className="mt-1 text-xs leading-5 text-[#746F67]">{props.card.body}</p>
          ) : null}
        </div>
      </div>
      {props.card.actions?.length ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {props.card.actions.map((action) => {
            const done = props.processedActionIds.includes(action.actionId);
            return (
              <Button
                key={action.actionId}
                size="sm"
                variant={action.appearance === "primary" ? "default" : "outline"}
                className={cn(
                  "rounded-lg",
                  action.appearance === "primary" &&
                    "bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]",
                )}
                disabled={done || props.state.phase === "loading"}
                onClick={() => props.onInvoke(action.actionId)}
              >
                {props.state.phase === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {done ? "已处理" : action.label}
              </Button>
            );
          })}
          {props.state.phase === "failed" ? (
            <span className="self-center text-xs text-[#C83B32]">
              {props.state.error ?? "执行失败,可重试"}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
