"use client";

import { AlertTriangle, Check, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DirectionReviewCard } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

export function DirectionReviewCardView(props: {
  card: DirectionReviewCard;
  state: CardInvokeState;
  processedActionIds: string[];
  onInvoke: (actionId: string) => void;
}) {
  const processed = props.processedActionIds.length > 0 || props.state.phase === "success";
  const passed = props.card.status === "passed";
  const unavailable = props.card.status === "unavailable";
  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 mt-3 w-full max-w-2xl rounded-lg border border-[#D8D1C5] bg-[#FFFDF9] p-4 shadow-[0_8px_24px_rgba(54,47,38,0.05)] duration-300">
      <div className="flex items-start gap-3">
        <span className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md",
          passed ? "bg-[#E8F1EA] text-[#42664B]" : unavailable ? "bg-[#F0EDE7] text-[#746F67]" : "bg-[#FFF1D8] text-[#875A16]",
        )}>
          {passed ? <ShieldCheck className="size-4" /> : <AlertTriangle className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#1F1D19]">
                {props.card.stage === "publish" ? "发布前方向审查" : "生成后方向审查"}
              </h3>
              <p className="mt-0.5 text-xs text-[#746F67]">
                {props.card.primaryLabel}{props.card.secondaryLabel ? ` + ${props.card.secondaryLabel}` : ""}
              </p>
            </div>
            <span className={cn(
              "rounded px-2 py-1 text-[11px] font-medium",
              passed ? "bg-[#E8F1EA] text-[#42664B]" : unavailable ? "bg-[#F0EDE7] text-[#67625A]" : "bg-[#FFF1D8] text-[#875A16]",
            )}>
              {passed ? `通过${props.card.score === undefined ? "" : ` · ${props.card.score}`}` : unavailable ? "暂不可用" : `需关注${props.card.score === undefined ? "" : ` · ${props.card.score}`}`}
            </span>
          </div>
          <p className="mt-2 text-xs leading-5 text-[#56514A]">{props.card.summary}</p>
        </div>
      </div>

      {props.card.criteria.length ? (
        <div className="mt-4 divide-y divide-[#E8E2D9] border-y border-[#E8E2D9]">
          {props.card.criteria.map((criterion) => (
            <div key={criterion.key} className="flex items-start gap-3 py-2.5 text-xs">
              <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full", criterion.passed ? "bg-[#66806D] text-white" : "bg-[#FFF1D8] text-[#875A16]")}>{criterion.passed ? <Check className="size-3" /> : "!"}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-medium text-[#292620]">{criterion.label}</strong>
                  <span className="font-mono text-[10px] text-[#746F67]">{Math.round(criterion.score)}/{Math.round(criterion.maxScore)}</span>
                </div>
                <p className="mt-0.5 leading-5 text-[#746F67]">{criterion.reason}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {props.card.suggestions.length ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-[#56514A]">修改建议</p>
          <ul className="mt-1 space-y-1 text-xs leading-5 text-[#746F67]">
            {props.card.suggestions.map((suggestion, index) => <li key={`${index}-${suggestion}`}>{index + 1}. {suggestion}</li>)}
          </ul>
        </div>
      ) : null}

      {props.card.actions.length ? (
        <div className="mt-4 flex items-center gap-2">
          {props.card.actions.map((action) => (
            <Button
              key={action.actionId}
              size="sm"
              className="rounded-md bg-[#355642] text-white hover:bg-[#294836]"
              disabled={processed || props.state.phase === "loading"}
              onClick={() => props.onInvoke(action.actionId)}
            >
              {props.state.phase === "loading" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {processed ? "已创建修订" : action.label}
            </Button>
          ))}
          {props.state.phase === "failed" ? <span className="text-xs text-[#A3342D]">{props.state.error}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
