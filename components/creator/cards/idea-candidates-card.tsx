"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Lightbulb, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { IdeaCandidatesCard } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

export function IdeaCandidatesCardView(props: {
  card: IdeaCandidatesCard;
  state: CardInvokeState;
  processedActionIds: string[];
  onChoose: (candidateId: string) => void;
  onSkip: () => void;
}) {
  const [selectedId, setSelectedId] = useState(props.card.candidates[0]?.id ?? "");
  const processed = props.processedActionIds.length > 0 || props.state.phase === "success";
  const disabled = processed || props.state.phase === "loading";
  const zh = props.card.uiLocale === "zh-CN";

  useEffect(() => {
    setSelectedId(props.card.candidates[0]?.id ?? "");
  }, [props.card.candidates, props.card.id]);

  return (
    <section
      className="animate-in fade-in slide-in-from-bottom-2 mt-3 w-full max-w-2xl rounded-xl border border-[#D8D1C5] bg-[#FFFDF9] p-4 shadow-[0_10px_30px_rgba(54,47,38,0.06)] duration-300 sm:p-5"
      data-testid={`card-idea-candidates-${props.card.id}`}
      data-state={processed ? "disabled" : props.state.phase}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#E8F0EA] text-[#476451]">
          <Lightbulb className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-[#1F1D19]">
            {zh ? "选择一个值得继续的选题" : "Choose an idea to develop"}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#746F67]">
            {zh
              ? "候选由你当前配置的模型生成。选择后会保存到个人选题库，你仍可以在下一条消息里要求调整。"
              : "Candidates were generated with your configured model. The selected idea is saved to your private idea library and can still be refined in chat."}
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5" role="radiogroup">
        {props.card.candidates.map((candidate, index) => {
          const active = selectedId === candidate.id;
          return (
            <button
              key={candidate.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => setSelectedId(candidate.id)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 active:translate-y-px",
                active
                  ? "-translate-y-px border-[#B9C9BD] bg-[#EDF4EE] shadow-[0_5px_14px_rgba(50,75,57,0.10)]"
                  : "border-[#DDD7CE] hover:-translate-y-px hover:border-[#BEB6AA] hover:bg-[#FAF8F4] hover:shadow-[0_5px_14px_rgba(54,47,38,0.07)]",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold",
                    active ? "bg-[#66806D] text-white" : "bg-[#EDE9E0] text-[#67625A]",
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5 text-[#1F1D19]">
                    {candidate.title}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[#56514A]">
                    {candidate.angle}
                  </span>
                  <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#746F67]">
                    <span>{zh ? "受众" : "Audience"}：{candidate.audience}</span>
                    <span>{zh ? "理由" : "Why"}：{candidate.reason}</span>
                  </span>
                </span>
                {active ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#476451]" /> : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {processed ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A7C59]">
            <Check className="h-4 w-4" /> {zh ? "已处理" : "Completed"}
          </span>
        ) : (
          <>
            <Button
              size="sm"
              disabled={disabled || !selectedId}
              onClick={() => props.onChoose(selectedId)}
              className="rounded-md bg-[#355642] text-white hover:bg-[#294836]"
            >
              {props.state.phase === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="h-4 w-4" />
              )}
              {props.card.chooseAction.label}
            </Button>
            <Button variant="ghost" size="sm" disabled={disabled} onClick={props.onSkip}>
              {props.card.skipAction.label}
            </Button>
          </>
        )}
        {props.state.phase === "failed" ? (
          <span className="basis-full text-xs text-[#C83B32]">
            {props.state.error ?? (zh ? "执行失败，可以重试。" : "Action failed. Try again.")}
          </span>
        ) : null}
      </div>
    </section>
  );
}
