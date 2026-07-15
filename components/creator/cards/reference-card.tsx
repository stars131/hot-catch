"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Link2,
  Loader2,
  ShieldQuestion,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { readApiJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ReferenceCard as ReferenceCardType } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";
import { PLATFORM_DEFINITIONS } from "@/lib/platforms/registry";

type JobView = {
  status: "queued" | "running" | "waiting_input" | "succeeded" | "failed" | "canceled";
  progress: number;
  stage: string | null;
  errorMessage: string | null;
  output?: { message?: string };
};

const TERMINAL = ["succeeded", "failed", "canceled"];

/** 参考卡:按 jobId 轮询导入任务;importing/ready/needs_input/failed 四态,刷新可恢复。 */
export function ReferenceCardView(props: {
  card: ReferenceCardType;
  state: CardInvokeState;
  processedActionIds: string[];
  onInvoke: (actionId: string) => void;
}) {
  const [job, setJob] = useState<JobView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!props.card.jobId) return;
    let stopped = false;
    let timer: number | undefined;
    async function poll() {
      try {
        const data = await readApiJson<{ job: JobView }>(
          await fetch(`/api/jobs/${props.card.jobId}`, { cache: "no-store" }),
        );
        if (stopped) return;
        setJob(data.job);
        if (!TERMINAL.includes(data.job.status) && data.job.status !== "waiting_input") {
          timer = window.setTimeout(() => void poll(), 2000);
        }
      } catch (error) {
        if (!stopped) {
          setLoadError(error instanceof Error ? error.message : "任务状态读取失败");
        }
      }
    }
    void poll();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [props.card.jobId]);

  const derivedState: ReferenceCardType["state"] = !props.card.jobId
    ? props.card.state
    : !job
      ? "importing"
      : job.status === "succeeded"
        ? "ready"
        : job.status === "waiting_input"
          ? "needs_input"
          : TERMINAL.includes(job.status)
            ? "failed"
            : "importing";

  const busy = props.state.phase === "loading";
  const host = (() => {
    try {
      return new URL(props.card.sourceUrl).hostname;
    } catch {
      return props.card.sourceUrl.slice(0, 40);
    }
  })();

  const visibleActions = (props.card.actions ?? []).filter((action) => {
    if (derivedState === "ready") return action.actionId !== "reference.retry";
    if (derivedState === "failed" || derivedState === "needs_input")
      return action.actionId === "reference.retry";
    return false;
  });

  return (
    <div
      className="mt-2 max-w-md rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-3.5"
      data-testid={`card-reference-${props.card.id}`}
      data-state={derivedState}
    >
      <div className="flex items-start gap-2.5">
        {derivedState === "importing" ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#C83B32]" />
        ) : derivedState === "ready" ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#4A7C59]" />
        ) : derivedState === "needs_input" ? (
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-[#8A6414]" />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#C83B32]" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-[#746F67]" />
            <p className="truncate text-sm font-medium">{host}</p>
            <span className="shrink-0 rounded bg-[#EDE9E0] px-1.5 py-0.5 text-[10px] text-[#67625A]">
              {props.card.platform && props.card.platform !== "web"
                ? PLATFORM_DEFINITIONS[props.card.platform].displayName
                : "网页"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#746F67]">
            {derivedState === "importing"
              ? (job?.stage ?? "正在导入…")
              : derivedState === "ready"
                ? "导入完成,可以选择下一步动作。"
                : derivedState === "needs_input"
                  ? (job?.output?.message ?? "需要补充信息后才能继续。")
                  : (job?.errorMessage ?? loadError ?? "导入失败,可重新尝试。")}
          </p>
          {props.card.summary ? (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#67625A]">
              {props.card.summary}
            </p>
          ) : null}
        </div>
      </div>

      {derivedState === "needs_input" ? (
        <a
          href="/settings/connections"
          className="mt-2 inline-block text-xs text-[#C83B32] underline underline-offset-2"
        >
          前往连接设置配置凭证
        </a>
      ) : null}

      {visibleActions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {visibleActions.map((action) => {
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
                  action.appearance === "ghost" && "border-transparent",
                )}
                disabled={(done && action.repeatable !== true) || busy}
                onClick={() => props.onInvoke(action.actionId)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {done && action.repeatable !== true ? "已处理" : action.label}
              </Button>
            );
          })}
        </div>
      ) : null}
      {props.state.phase === "failed" ? (
        <p className="mt-2 text-xs text-[#C83B32]">{props.state.error ?? "执行失败,可重试"}</p>
      ) : null}
    </div>
  );
}
