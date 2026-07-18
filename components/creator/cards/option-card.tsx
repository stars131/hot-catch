"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OptionCard as OptionCardType } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

export function OptionCardView(props: {
  card: OptionCardType;
  state: CardInvokeState;
  processed: boolean;
  onSubmit: (optionIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const disabled = props.processed || props.state.phase === "loading" || props.state.phase === "success";

  function toggle(optionId: string) {
    if (disabled) return;
    setSelected((current) => {
      if (props.card.mode === "single") return [optionId];
      return current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
    });
  }

  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 mt-2 max-w-md rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-3.5 shadow-[0_8px_24px_rgba(54,47,38,0.055)] duration-300"
      data-testid={`card-option-${props.card.id}`}
      data-state={props.processed ? "disabled" : props.state.phase}
    >
      <p className="text-sm font-medium">{props.card.title}</p>
      <div className="mt-2.5 space-y-1.5" role={props.card.mode === "single" ? "radiogroup" : "group"}>
        {props.card.options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              role={props.card.mode === "single" ? "radio" : "checkbox"}
              aria-checked={active}
              disabled={disabled}
              onClick={() => toggle(option.id)}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-[background-color,border-color,box-shadow,transform] duration-200",
                active
                  ? "-translate-y-px border-[#B9C9BD] bg-[#EDF4EE] shadow-[0_4px_12px_rgba(50,75,57,0.10)]"
                  : "border-[#DDD7CE] hover:-translate-y-px hover:border-[#C8C1B5] hover:bg-[#FAF8F4] hover:shadow-[0_4px_12px_rgba(54,47,38,0.07)]",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                  active ? "border-[#66806D] bg-[#66806D]" : "border-[#B8B1A6]",
                )}
              >
                {active ? <Check className="h-3 w-3 text-[#FFFDF9]" /> : null}
              </span>
              <span className="min-w-0">
                <span className="font-medium">
                  {option.label}
                  {option.recommended ? (
                    <span className="ml-1.5 rounded bg-[#EDE9E0] px-1 py-0.5 text-[10px] text-[#67625A]">
                      推荐
                    </span>
                  ) : null}
                </span>
                {option.description ? (
                  <span className="mt-0.5 block text-xs leading-5 text-[#746F67]">
                    {option.description}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {props.processed || props.state.phase === "success" ? (
          <span className="inline-flex items-center gap-1 text-xs text-[#4A7C59]">
            <Check className="h-3.5 w-3.5" /> 已选择
          </span>
        ) : (
          <Button
            size="sm"
            className="rounded-md bg-[#355642] text-white hover:bg-[#294836]"
            disabled={disabled || selected.length === 0}
            onClick={() => props.onSubmit(selected)}
          >
            {props.state.phase === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {props.card.submitAction.label}
          </Button>
        )}
        {props.state.phase === "failed" ? (
          <span className="text-xs text-[#C83B32]">{props.state.error ?? "执行失败,可重试"}</span>
        ) : null}
      </div>
    </div>
  );
}
