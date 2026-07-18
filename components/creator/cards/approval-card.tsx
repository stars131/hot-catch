"use client";

import { useState } from "react";
import { Check, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ApprovalCard as ApprovalCardType } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

const RISK = {
  low: { label: "低风险", className: "bg-[#EDE9E0] text-[#67625A]" },
  medium: { label: "中风险", className: "bg-[#D9A441]/15 text-[#8A6414]" },
  high: { label: "高风险", className: "bg-[#C83B32]/10 text-[#C83B32]" },
} as const;

export function ApprovalCardView(props: {
  card: ApprovalCardType;
  state: CardInvokeState;
  processedActionIds: string[];
  onInvoke: (actionId: string) => void;
}) {
  const [armed, setArmed] = useState(false);
  const resolvedAction = props.processedActionIds.find((actionId) =>
    [props.card.confirmAction.actionId, props.card.cancelAction.actionId].includes(actionId),
  );
  const disabled = Boolean(resolvedAction) || props.state.phase === "loading" || props.state.phase === "success";
  const risk = RISK[props.card.risk];

  function confirm() {
    if (props.card.confirmAction.requiresConfirmation && !armed) {
      setArmed(true);
      return;
    }
    props.onInvoke(props.card.confirmAction.actionId);
  }

  return (
    <div
      className="mt-2 max-w-md rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-3.5"
      data-testid={`card-approval-${props.card.id}`}
      data-state={resolvedAction ? "disabled" : props.state.phase}
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#C83B32]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium">{props.card.title}</p>
            <span className={cn("rounded px-1.5 py-0.5 text-[10px]", risk.className)}>
              {risk.label}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#746F67]">{props.card.summary}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {resolvedAction ? (
          <span className="inline-flex items-center gap-1 text-xs text-[#67625A]">
            <Check className="h-3.5 w-3.5" />
            {resolvedAction === props.card.confirmAction.actionId ? "已确认" : "已取消"}
          </span>
        ) : (
          <>
            <Button
              size="sm"
              className="rounded-lg bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]"
              disabled={disabled}
              onClick={confirm}
            >
              {props.state.phase === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {armed ? "再次点击确认" : props.card.confirmAction.label}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg border-[#DDD7CE]"
              disabled={disabled}
              onClick={() => props.onInvoke(props.card.cancelAction.actionId)}
            >
              {props.card.cancelAction.label}
            </Button>
          </>
        )}
        {props.state.phase === "failed" ? (
          <span className="text-xs text-[#C83B32]">{props.state.error ?? "执行失败,可重试"}</span>
        ) : null}
      </div>
    </div>
  );
}
