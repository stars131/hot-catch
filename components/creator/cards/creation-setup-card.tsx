"use client";

import { useEffect, useState } from "react";
import { Check, Languages, Loader2, Puzzle, Send, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CreationSetupCard } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

export function CreationSetupCardView(props: {
  card: CreationSetupCard;
  state: CardInvokeState;
  processed: boolean;
  onSubmit: (optionIds: string[]) => void;
}) {
  const [platformIds, setPlatformIds] = useState<string[]>(props.card.defaultPlatformIds);
  const [localeId, setLocaleId] = useState<string>(props.card.defaultLocaleId);
  const [skillIds, setSkillIds] = useState<string[]>(props.card.defaultSkillIds);
  const disabled = props.processed || props.state.phase === "loading" || props.state.phase === "success";
  const zh = props.card.uiLocale === "zh-CN";

  useEffect(() => {
    setPlatformIds(props.card.defaultPlatformIds);
    setLocaleId(props.card.defaultLocaleId);
    setSkillIds(props.card.defaultSkillIds);
  }, [props.card.id, props.card.defaultLocaleId, props.card.defaultPlatformIds, props.card.defaultSkillIds]);

  function togglePlatform(id: string) {
    if (disabled) return;
    setPlatformIds((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((value) => value !== id);
      }
      return current.length >= props.card.maxPlatforms ? current : [...current, id];
    });
  }

  function toggleSkill(id: string) {
    if (disabled) return;
    setSkillIds((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length >= 8
          ? current
          : [...current, id],
    );
  }

  return (
    <section
      className="mt-3 w-full max-w-2xl overflow-hidden rounded-2xl border border-[#D8D1C5] bg-[#FFFDF9]"
      data-testid={`card-creation-setup-${props.card.id}`}
      data-state={props.processed ? "disabled" : props.state.phase}
    >
      <div className="border-b border-[#E6E0D7] px-4 py-3.5 sm:px-5">
        <p className="text-sm font-semibold text-[#1F1D19]">
          {zh ? "确认这次创作包" : "Confirm this creation bundle"}
        </p>
        <p className="mt-1 line-clamp-3 text-xs leading-5 text-[#746F67]">{props.card.brief}</p>
      </div>

      <div className="space-y-5 px-4 py-4 sm:px-5">
        <ChoiceSection
          icon={<Shapes className="h-4 w-4" />}
          title={zh ? `目标平台（1–${props.card.maxPlatforms} 个）` : `Target platforms (1–${props.card.maxPlatforms})`}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {props.card.platformOptions.map((option) => {
              const active = platformIds.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => togglePlatform(option.id)}
                  className={cn(
                    "flex min-h-16 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,transform] duration-200 active:translate-y-px",
                    active
                      ? "border-[#C83B32] bg-[#C83B32]/[0.055]"
                      : "border-[#DDD7CE] hover:border-[#BEB6AA] hover:bg-[#F8F5EF]",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <SelectionMark active={active} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#1F1D19]">{option.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-[#746F67]">
                      {option.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </ChoiceSection>

        <ChoiceSection
          icon={<Languages className="h-4 w-4" />}
          title={zh ? "内容语言" : "Content language"}
        >
          <div className="flex flex-wrap gap-2">
            {props.card.localeOptions.map((option) => {
              const active = localeId === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  onClick={() => setLocaleId(option.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs transition-colors",
                    active
                      ? "border-[#C83B32] bg-[#C83B32] text-[#FFFDF9]"
                      : "border-[#DDD7CE] text-[#56514A] hover:bg-[#F3EFE8]",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </ChoiceSection>

        <ChoiceSection
          icon={<Puzzle className="h-4 w-4" />}
          title={zh ? "本次使用的 Skill（可多选）" : "Skills for this run (optional)"}
        >
          {props.card.skillOptions.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {props.card.skillOptions.map((option) => {
                const active = skillIds.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    onClick={() => toggleSkill(option.id)}
                    className={cn(
                      "flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-[#C83B32] bg-[#C83B32]/[0.05]"
                        : "border-[#DDD7CE] hover:bg-[#F8F5EF]",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <SelectionMark active={active} compact />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-[#1F1D19]">{option.label}</span>
                      {option.description ? (
                        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-[#746F67]">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-[#746F67]">
              {zh ? "当前没有启用的生成 Skill，可以直接继续。" : "No generation skills are enabled. You can continue without one."}
            </p>
          )}
        </ChoiceSection>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[#E6E0D7] bg-[#FAF7F1] px-4 py-3 sm:px-5">
        {props.processed || props.state.phase === "success" ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A7C59]">
            <Check className="h-4 w-4" /> {zh ? "已创建任务" : "Tasks created"}
          </span>
        ) : (
          <Button
            size="sm"
            disabled={disabled || platformIds.length === 0 || !localeId}
            onClick={() => props.onSubmit([...platformIds, localeId, ...skillIds])}
            className="rounded-lg bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]"
          >
            {props.state.phase === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {props.card.confirmAction.label}
          </Button>
        )}
        <span className="text-[11px] text-[#746F67]">
          {zh
            ? `${platformIds.length} 个平台 · ${props.card.localeOptions.find((item) => item.id === localeId)?.label ?? localeId} · ${skillIds.length} 个 Skill`
            : `${platformIds.length} platforms · ${props.card.localeOptions.find((item) => item.id === localeId)?.label ?? localeId} · ${skillIds.length} skills`}
        </span>
        {props.state.phase === "failed" ? (
          <span className="basis-full text-xs text-[#C83B32]">{props.state.error ?? (zh ? "执行失败，可以重试。" : "Action failed. Try again.")}</span>
        ) : null}
      </div>
    </section>
  );
}

function ChoiceSection(props: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-[#56514A]">
        {props.icon}
        {props.title}
      </legend>
      {props.children}
    </fieldset>
  );
}

function SelectionMark({ active, compact = false }: { active: boolean; compact?: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 flex shrink-0 items-center justify-center rounded-md border",
        compact ? "h-4 w-4" : "h-5 w-5",
        active ? "border-[#C83B32] bg-[#C83B32]" : "border-[#B8B1A6] bg-[#FFFDF9]",
      )}
    >
      {active ? <Check className={cn("text-[#FFFDF9]", compact ? "h-3 w-3" : "h-3.5 w-3.5")} /> : null}
    </span>
  );
}
