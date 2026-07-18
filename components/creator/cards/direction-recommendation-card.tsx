"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  DirectionRecommendationCard,
} from "@/lib/creator/chat-protocol";
import type { DirectionRef } from "@/lib/creator/creative-direction";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

type CatalogDirection = {
  id: string;
  ref: DirectionRef;
  key: string;
  category: string;
  label: string;
  summary: string;
  role: "primary" | "secondary" | "both";
  outline: string[];
  conflicts?: string[];
};

const CATEGORY_LABELS: Record<string, string> = {
  narrative: "叙事纪实",
  utility: "教程工具",
  explanation: "观点解释",
  evidence: "证据决策",
  engagement: "传播互动",
};

export function DirectionRecommendationCardView(props: {
  card: DirectionRecommendationCard;
  state: CardInvokeState;
  processedActionIds: string[];
  onConfirm: (payload: { primary: DirectionRef; secondary?: DirectionRef }) => void;
  onSupplement: (answers: Record<string, string>) => void;
}) {
  const zh = props.card.uiLocale === "zh-CN";
  const initialSecondary = getVisibleSuggestedSecondary(props.card.recommendations);
  const [primary, setPrimary] = useState<DirectionRef | null>(
    props.card.recommendations[0]?.ref ?? null,
  );
  const [secondary, setSecondary] = useState<DirectionRef | null>(
    initialSecondary,
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogDirection[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const processed = props.processedActionIds.length > 0 || props.state.phase === "success";
  const disabled = processed || props.state.phase === "loading";

  useEffect(() => {
    setPrimary(props.card.recommendations[0]?.ref ?? null);
    setSecondary(getVisibleSuggestedSecondary(props.card.recommendations));
    setAnswers({});
    setExpanded(false);
    setQuery("");
  }, [props.card.id, props.card.recommendations]);

  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setCatalogLoading(true);
      setCatalogError(null);
      const params = new URLSearchParams({ locale: props.card.uiLocale });
      if (query.trim()) params.set("q", query.trim());
      fetch(`/api/creative-directions?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("方向目录加载失败");
          return response.json() as Promise<{ data?: { directions?: CatalogDirection[] }; directions?: CatalogDirection[] }>;
        })
        .then((payload) => setCatalog(payload.data?.directions ?? payload.directions ?? []))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setCatalogError(error instanceof Error ? error.message : "方向目录加载失败");
        })
        .finally(() => {
          if (!controller.signal.aborted) setCatalogLoading(false);
        });
    }, 160);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [expanded, props.card.uiLocale, query]);

  const allChoices = useMemo(() => {
    const map = new Map<string, { ref: DirectionRef; label: string; summary: string; category: string }>();
    for (const item of props.card.recommendations) {
      map.set(refKey(item.ref), { ref: item.ref, label: item.label, summary: item.summary, category: item.category });
    }
    for (const item of catalog) {
      map.set(refKey(item.ref), { ref: item.ref, label: item.label, summary: item.summary, category: item.category });
    }
    return [...map.values()];
  }, [catalog, props.card.recommendations]);

  const selectedPrimary = allChoices.find((item) => sameRef(item.ref, primary));
  const selectedSecondary = allChoices.find((item) => sameRef(item.ref, secondary));
  const requiredComplete = props.card.missingInputs
    .filter((item) => item.required)
    .every((item) => answers[item.key]?.trim());

  if (processed) {
    return (
      <section className="mt-3 flex w-full max-w-2xl items-center gap-3 rounded-lg border border-[#C9D6CC] bg-[#F1F6F2] px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#66806D] text-white">
          <Check className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#294836]">{zh ? "方向已处理" : "Direction completed"}</p>
          <p className="truncate text-xs text-[#607066]">
            {selectedPrimary?.label ?? props.card.recommendations[0]?.label}
            {selectedSecondary ? ` + ${selectedSecondary.label}` : ""}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="animate-in fade-in slide-in-from-bottom-2 mt-3 w-full max-w-2xl rounded-lg border border-[#D8D1C5] bg-[#FFFDF9] shadow-[0_10px_30px_rgba(54,47,38,0.06)] duration-300"
      data-testid={`card-direction-${props.card.id}`}
      data-state={props.card.state}
    >
      <header className="flex items-start gap-3 border-b border-[#E8E2D9] px-4 py-4 sm:px-5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#E8F0EA] text-[#476451]">
          <BrainCircuit className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#1F1D19]">
              {props.card.state === "needs_input"
                ? (zh ? "先补充方向判断信息" : "Add direction details")
                : (zh ? "确认表达方向" : "Confirm a direction")}
            </h3>
            <span className="inline-flex items-center gap-1 rounded bg-[#F0EDE7] px-1.5 py-0.5 text-[10px] text-[#67625A]">
              <Sparkles className="size-3" />
              {props.card.source === "model" ? (zh ? "模型推荐" : "Model ranked") : (zh ? "规则筛选" : "Rule filtered")}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#67625A]">{props.card.intentSummary}</p>
        </div>
      </header>

      {props.card.state === "needs_input" ? (
        <div className="space-y-4 px-4 py-4 sm:px-5">
          {props.card.missingInputs.map((item) => (
            <label key={item.key} className="block">
              <span className="flex items-center gap-1 text-xs font-medium text-[#3E3A34]">
                {item.label}{item.required ? <span className="text-[#9A681B]">必填</span> : null}
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#746F67]">{item.reason}</span>
              {item.inputType === "choice" && item.options?.length ? (
                <select
                  className="mt-2 h-10 w-full rounded-md border border-[#D8D1C5] bg-white px-3 text-sm outline-none focus:border-[#879C8C] focus:ring-2 focus:ring-[#DDE8DF]"
                  value={answers[item.key] ?? ""}
                  disabled={disabled}
                  onChange={(event) => setAnswers((current) => ({ ...current, [item.key]: event.target.value }))}
                >
                  <option value="">{zh ? "请选择" : "Choose"}</option>
                  {item.options.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <Textarea
                  className="mt-2 min-h-20 resize-y focus-visible:ring-[#879C8C]"
                  value={answers[item.key] ?? ""}
                  disabled={disabled}
                  placeholder={zh ? `填写${item.label}` : `Enter ${item.label}`}
                  onChange={(event) => setAnswers((current) => ({ ...current, [item.key]: event.target.value }))}
                />
              )}
            </label>
          ))}
          <Button
            size="sm"
            className="rounded-md bg-[#355642] text-white hover:bg-[#294836]"
            disabled={disabled || !requiredComplete}
            onClick={() => props.onSupplement(answers)}
          >
            {props.state.phase === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {props.card.supplementAction.label}
          </Button>
        </div>
      ) : (
        <div className="px-4 py-4 sm:px-5">
          <div className="divide-y divide-[#E8E2D9] border-y border-[#E8E2D9]">
            {props.card.recommendations.map((item, index) => {
              const active = sameRef(item.ref, primary);
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    "flex w-full items-start gap-3 px-2 py-3 text-left transition-colors",
                    active ? "bg-[#EDF4EE]" : "hover:bg-[#FAF8F4]",
                  )}
                  disabled={disabled}
                  onClick={() => {
                    setPrimary(item.ref);
                    if (sameRef(item.ref, secondary)) setSecondary(null);
                    else if (!secondary && item.suggestedSecondary) setSecondary(item.suggestedSecondary);
                  }}
                >
                  <span className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold",
                    active ? "bg-[#66806D] text-white" : "bg-[#EDE9E0] text-[#67625A]",
                  )}>
                    {active ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#1F1D19]">{item.label}</span>
                      <span className="text-[10px] text-[#746F67]">{CATEGORY_LABELS[item.category] ?? item.category}</span>
                      {item.confidence !== undefined ? (
                        <span className="text-[10px] font-medium text-[#476451]">{Math.round(item.confidence * 100)}% 匹配</span>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[#56514A]">{item.rationale}</span>
                    <span className="mt-1 block text-[11px] leading-5 text-[#746F67]">{item.outlinePreview.join(" → ")}</span>
                    {item.risks.length ? <span className="mt-1 block text-[11px] text-[#875A16]">注意：{item.risks.join("；")}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#476451] hover:text-[#294836]"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            {expanded ? (zh ? "收起方向库" : "Hide catalog") : (zh ? "查看更多方向" : "Browse more directions")}
          </button>

          {expanded ? (
            <div className="mt-3 border-t border-[#E8E2D9] pt-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8A847B]" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={zh ? "搜索 40 个方向" : "Search 40 directions"}
                  className="h-9 pl-9 focus-visible:ring-[#879C8C]"
                />
              </div>
              <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-[#EEE9E2]">
                {catalogLoading ? <p className="py-4 text-center text-xs text-[#746F67]">加载方向目录…</p> : null}
                {catalogError ? <p className="py-3 text-xs text-[#A3342D]">{catalogError}</p> : null}
                {!catalogLoading && !catalogError ? catalog.map((item) => {
                  const active = sameRef(item.ref, primary);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      className={cn("flex w-full items-center gap-3 px-2 py-2.5 text-left text-xs", active ? "bg-[#EDF4EE]" : "hover:bg-[#FAF8F4]")}
                      onClick={() => setPrimary(item.ref)}
                    >
                      <span className={cn("flex size-4 items-center justify-center rounded-full border", active ? "border-[#66806D] bg-[#66806D] text-white" : "border-[#B8B1A6]")}>{active ? <Check className="size-3" /> : null}</span>
                      <span className="min-w-0 flex-1"><strong className="font-medium text-[#292620]">{item.label}</strong><span className="ml-2 text-[#746F67]">{item.summary}</span></span>
                    </button>
                  );
                }) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="block">
              <span className="text-xs font-medium text-[#56514A]">{zh ? "辅方向（可选）" : "Secondary direction (optional)"}</span>
              <select
                className="mt-1 h-10 w-full rounded-md border border-[#D8D1C5] bg-white px-3 text-sm outline-none focus:border-[#879C8C] focus:ring-2 focus:ring-[#DDE8DF]"
                value={secondary ? refKey(secondary) : "none"}
                onChange={(event) => {
                  const next = allChoices.find((item) => refKey(item.ref) === event.target.value);
                  setSecondary(next?.ref ?? null);
                }}
              >
                <option value="none">{zh ? "不使用辅方向" : "No secondary direction"}</option>
                {allChoices.filter((item) => !sameRef(item.ref, primary)).map((item) => (
                  <option key={refKey(item.ref)} value={refKey(item.ref)}>{item.label}</option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              className="h-10 rounded-md bg-[#355642] px-4 text-white hover:bg-[#294836]"
              disabled={disabled || !primary}
              onClick={() => primary && props.onConfirm({ primary, ...(secondary ? { secondary } : {}) })}
            >
              {props.state.phase === "loading" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {props.card.confirmAction.label}
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-[#746F67]">
            {selectedPrimary?.label ?? ""}{selectedSecondary ? ` + ${selectedSecondary.label}` : ""} · {zh ? "主方向决定结构，辅方向只增强表达" : "Primary controls structure; secondary only enriches expression"}
          </p>
          {props.state.phase === "failed" ? <p className="mt-2 text-xs text-[#A3342D]">{props.state.error}</p> : null}
        </div>
      )}
    </section>
  );
}

function refKey(ref: DirectionRef) {
  return `${ref.source}:${ref.key}:${ref.version}:${ref.candidateId ?? ""}`;
}

function sameRef(left: DirectionRef | null | undefined, right: DirectionRef | null | undefined) {
  if (!left || !right) return false;
  return refKey(left) === refKey(right);
}

function getVisibleSuggestedSecondary(
  recommendations: DirectionRecommendationCard["recommendations"],
) {
  const suggested = recommendations[0]?.suggestedSecondary;
  if (!suggested) return null;
  return recommendations.some((item) => sameRef(item.ref, suggested)) ? suggested : null;
}
