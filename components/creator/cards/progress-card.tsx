"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, PauseCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { readApiJson } from "@/lib/api-client";
import type { ProgressCard as ProgressCardType } from "@/lib/creator/chat-protocol";

type JobView = {
  status: "queued" | "running" | "waiting_input" | "succeeded" | "failed" | "canceled";
  progress: number;
  stage: string | null;
  errorMessage: string | null;
};

const TERMINAL = ["succeeded", "failed", "canceled"];

/** 进度卡:轮询既有 /api/jobs/:id(2 秒),终态停止;waiting_input 内联提示。 */
export function ProgressCardView(props: { card: ProgressCardType }) {
  const [job, setJob] = useState<JobView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    async function poll() {
      try {
        const data = await readApiJson<{ job: JobView }>(
          await fetch(`/api/jobs/${props.card.jobId}`, { cache: "no-store" }),
        );
        if (stopped) return;
        setJob(data.job);
        setLoadError(null);
        if (!TERMINAL.includes(data.job.status) && data.job.status !== "waiting_input") {
          timer = window.setTimeout(() => void poll(), 2000);
        }
      } catch (error) {
        if (stopped) return;
        setLoadError(error instanceof Error ? error.message : "任务状态读取失败");
      }
    }
    void poll();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [props.card.jobId]);

  async function cancel() {
    setCanceling(true);
    try {
      await readApiJson(
        await fetch(`/api/jobs/${props.card.jobId}/cancel`, { method: "POST" }),
      );
      setJob((current) => (current ? { ...current, status: "canceled" } : current));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "取消失败");
    } finally {
      setCanceling(false);
    }
  }

  const phase = !job
    ? "loading"
    : job.status === "succeeded"
      ? "success"
      : job.status === "failed" || job.status === "canceled"
        ? "failed"
        : "loading";

  return (
    <div
      className="mt-2 max-w-md rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-3.5"
      data-testid={`card-progress-${props.card.id}`}
      data-state={phase}
    >
      <div className="flex items-center gap-2">
        {phase === "success" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4A7C59]" />
        ) : phase === "failed" ? (
          <XCircle className="h-4 w-4 shrink-0 text-[#C83B32]" />
        ) : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#C83B32]" />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{props.card.title}</p>
        {props.card.cancelable && job && !TERMINAL.includes(job.status) ? (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-lg text-[#746F67]"
            disabled={canceling}
            onClick={() => void cancel()}
          >
            <PauseCircle className="h-4 w-4" /> 取消
          </Button>
        ) : null}
      </div>

      {job && !TERMINAL.includes(job.status) ? (
        <div className="mt-2.5">
          <Progress value={job.progress} />
          <p className="mt-1.5 text-xs text-[#746F67]">
            {job.status === "waiting_input"
              ? "需要你补充信息后才能继续。"
              : (job.stage ?? "任务排队中…")}
          </p>
        </div>
      ) : null}
      {job?.status === "failed" ? (
        <p className="mt-2 text-xs text-[#C83B32]">{job.errorMessage ?? "任务失败"}</p>
      ) : null}
      {job?.status === "canceled" ? (
        <p className="mt-2 text-xs text-[#746F67]">任务已取消。</p>
      ) : null}
      {loadError ? <p className="mt-2 text-xs text-[#C83B32]">{loadError}</p> : null}
    </div>
  );
}
