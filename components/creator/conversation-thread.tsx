"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertCircle,
  CircleStop,
  Import,
  Lightbulb,
  Loader2,
  PenLine,
  RotateCcw,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { scrollFollowState, type ScrollFollowState } from "@/lib/conversations/scroll-follow";
import type {
  ArtifactCard,
  PatchCard,
  PublishReadinessCard,
} from "@/lib/creator/chat-protocol";
import type {
  ActiveRun,
  ConversationCheckpoint,
  RunTrace,
  ThreadMessage,
} from "@/lib/creator/conversation-client";
import {
  CardRenderer,
  type InvokeCardAction,
} from "@/components/creator/cards/card-renderer";

export type QuickEntry = {
  id: string;
  label: string;
  hint: string;
  icon: "idea" | "import" | "xhs" | "douyin";
  kind: "link" | "prefill";
  href?: string;
  prefill?: string;
};

const QUICK_ICONS = {
  idea: Lightbulb,
  import: Import,
  xhs: PenLine,
  douyin: Video,
} as const;

export function ConversationThread(props: {
  messages: ThreadMessage[];
  state: "empty" | "loading" | "ready" | "error";
  errorMessage?: string;
  busy: boolean;
  processedKeys: string[];
  activeRun: ActiveRun | null;
  runTraces: RunTrace[];
  checkpoints: ConversationCheckpoint[];
  quickEntries: QuickEntry[];
  onQuickEntry: (entry: QuickEntry) => void;
  onStartNew: () => void;
  onInvokeAction: InvokeCardAction;
  onRetry: (message: ThreadMessage) => void;
  onCancelRun: (runId: string) => void;
  onArtifactOpen?: (card: ArtifactCard) => void;
  onArtifactRefine?: (card: ArtifactCard) => void;
  onPatchCopyToEditor?: (card: PatchCard) => void;
  onPatchRefineAgain?: (card: PatchCard) => void;
  onOpenPublishChecklist?: (card: PublishReadinessCard) => void;
  onCopyMissingItems?: (card: PublishReadinessCard) => void;
  onOpenPublishWorkspace?: (contentId: string | null) => void;
  onOpenConnections?: () => void;
  onJobSettled?: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const followOutputRef = useRef<ScrollFollowState>("following");
  const lastMessageContentLength = props.messages.at(-1)?.content.length ?? 0;
  const virtualizer = useVirtualizer({
    count: props.messages.length,
    getScrollElement: () => document.getElementById("conversation-scroll-root"),
    estimateSize: () => 140,
    overscan: 8,
    getItemKey: (index) => props.messages[index]?.id ?? index,
  });

  useEffect(() => {
    const scrollRoot = document.getElementById("conversation-scroll-root");
    if (!scrollRoot) return;
    const updateFollowState = () => {
      followOutputRef.current = scrollFollowState(
        scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight,
        followOutputRef.current,
      );
    };
    scrollRoot.addEventListener("scroll", updateFollowState, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", updateFollowState);
  }, []);

  useEffect(() => {
    if (followOutputRef.current !== "following") return;
    requestAnimationFrame(() => {
      if (props.messages.length) virtualizer.scrollToIndex(props.messages.length - 1, { align: "end" });
      else bottomRef.current?.scrollIntoView({ block: "end" });
    });
  }, [props.messages.length, lastMessageContentLength, props.busy, virtualizer]);

  if (props.state === "loading") {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-8">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className={cn(
              "h-16 animate-pulse rounded-xl bg-[#EDE9E0]",
              item % 2 === 1 ? "ml-auto w-2/3" : "w-5/6",
            )}
          />
        ))}
      </div>
    );
  }

  if (props.state === "error") {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-20 text-center">
        <AlertCircle className="h-8 w-8 text-[#C83B32]" />
        <h2 className="mt-4 text-lg font-semibold">无法打开这个会话</h2>
        <p className="mt-2 text-sm leading-6 text-[#746F67]">
          {props.errorMessage ?? "会话不存在,或不属于当前账号。"}
        </p>
        <Button
          className="mt-6 rounded-md bg-[#355642] text-white hover:bg-[#294836]"
          onClick={props.onStartNew}
        >
          新建创作会话
        </Button>
      </div>
    );
  }

  if (props.state === "empty") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col justify-center px-4 py-16 min-h-full">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          今天想创作什么?
        </h2>
        <p className="mt-2 text-center text-sm text-[#67625A]">
          直接描述你的想法,或从下面的入口开始。
        </p>
        <div className="mt-8 grid gap-2 sm:grid-cols-2">
          {props.quickEntries.map((entry) => {
            const Icon = QUICK_ICONS[entry.icon];
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => props.onQuickEntry(entry)}
                className="flex items-start gap-3 rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-3.5 text-left hover:border-[#C8C1B5]"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#C83B32]" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{entry.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-[#746F67]">
                    {entry.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <ul
        className="relative"
        aria-live="polite"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const message = props.messages[item.index];
          return (
          <li
            key={message.id}
            ref={virtualizer.measureElement}
            data-index={item.index}
            data-role={message.role}
            data-status={message.status}
            className="absolute left-0 top-0 w-full pb-5"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            {message.role === "user" ? (
              <div className="ml-auto w-fit max-w-[85%] rounded-xl bg-[#EDE9E0] px-3.5 py-2.5 text-[15px] leading-7">
                {message.content}
              </div>
            ) : (
              <div className="max-w-none">
                {message.status === "pending" ? (
                  <p className="flex items-center gap-2 text-sm text-[#746F67]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#66806D]" />
                    星迹正在处理…
                  </p>
                ) : (
                  <p
                    className={cn(
                      "whitespace-pre-wrap text-[15px] leading-7 text-[#1F1D19]",
                      message.status === "failed" && "text-[#8A2B24]",
                    )}
                  >
                    {clarifyLegacyTaskStatus(message.content)}
                  </p>
                )}
                {message.status === "failed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 rounded-lg border-[#DDD7CE]"
                    onClick={() => props.onRetry(props.messages[item.index - 1] ?? message)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> 重试
                  </Button>
                ) : null}
                {message.cards.map((card) => (
                  <CardRenderer
                    key={card.id}
                    card={card}
                    sourceMessageId={message.id}
                    processedKeys={props.processedKeys}
                    onInvoke={props.onInvokeAction}
                    onArtifactOpen={props.onArtifactOpen}
                    onArtifactRefine={props.onArtifactRefine}
                    onPatchCopyToEditor={props.onPatchCopyToEditor}
                    onPatchRefineAgain={props.onPatchRefineAgain}
                    onOpenPublishChecklist={props.onOpenPublishChecklist}
                    onCopyMissingItems={props.onCopyMissingItems}
                    onOpenPublishWorkspace={props.onOpenPublishWorkspace}
                    onOpenConnections={props.onOpenConnections}
                    onJobSettled={props.onJobSettled}
                  />
                ))}
              </div>
            )}
          </li>
        );})}
      </ul>
      {props.runTraces.length || props.checkpoints.length ? (
        <div className="mt-5 space-y-2 border-t border-[#E4DED4] pt-4">
          {props.runTraces.length ? (
            <details className="rounded-lg border border-[#E4DED4] bg-[#FAF9F6] px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-[#4F4A43]">
                运行轨迹 ({props.runTraces.length})
              </summary>
              <div className="mt-3 space-y-2">
                {props.runTraces.map((trace) => (
                  <RunTraceRow key={trace.id} trace={trace} />
                ))}
              </div>
            </details>
          ) : null}
          {props.checkpoints.length ? (
            <details className="rounded-lg border border-[#E4DED4] bg-[#FAF9F6] px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-[#4F4A43]">
                上下文检查点 ({props.checkpoints.length})
              </summary>
              <div className="mt-3 space-y-3">
                {props.checkpoints.map((checkpoint) => (
                  <div key={checkpoint.id} className="border-l-2 border-[#C8C1B5] pl-3 text-xs leading-5 text-[#67625A]">
                    <p className="font-medium text-[#4F4A43]">
                      {checkpoint.messageCount} 条消息 · 约 {checkpoint.tokenEstimate.toLocaleString()} tokens
                    </p>
                    <p className="mt-1 whitespace-pre-wrap">{checkpoint.summary}</p>
                    {hasLedgerEntries(checkpoint.ledger) ? (
                      <pre className="mt-2 max-h-32 overflow-auto rounded bg-[#F1EEE8] p-2 text-[11px]">
                        {JSON.stringify(checkpoint.ledger, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
      <ul className="mt-2 flex flex-col gap-3">
        {props.busy ? (
          <li className="flex items-center gap-2 text-sm text-[#746F67]">
            <Loader2 className="h-4 w-4 animate-spin text-[#66806D]" /> 星迹正在思考…
          </li>
        ) : null}
        {props.activeRun && !props.busy ? (
          <li
            className="flex items-center gap-2 rounded-xl border border-[#D9A441]/50 bg-[#FFFDF9] px-3.5 py-2.5 text-sm text-[#8A6414]"
            data-testid="active-run-banner"
          >
            {props.activeRun.status === "waiting_input" ? (
              <>需要你补充信息后才能继续。可以直接在下方输入。</>
            ) : (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>
                  本轮内容仍在生成。上方“已建立任务”表示任务已进入队列，不代表作品已经完成。
                </span>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto rounded-lg text-[#746F67]"
              onClick={() => props.onCancelRun(props.activeRun!.id)}
            >
              <CircleStop className="h-4 w-4" /> 取消
            </Button>
          </li>
        ) : null}
      </ul>
      <div ref={bottomRef} />
    </div>
  );
}

function RunTraceRow({ trace }: { trace: RunTrace }) {
  const started = trace.startedAt ? new Date(trace.startedAt).getTime() : new Date(trace.createdAt).getTime();
  const ended = trace.completedAt ? new Date(trace.completedAt).getTime() : Date.now();
  const duration = Math.max(0, Math.round((ended - started) / 100) / 10);
  return (
    <details className="rounded border border-[#E4DED4] bg-[#FFFDF9] px-2.5 py-2">
      <summary className="cursor-pointer text-xs text-[#4F4A43]">
        {trace.command ?? "agent.run"} · {trace.status} · {duration}s
      </summary>
      <div className="mt-2 space-y-1 text-xs text-[#746F67]">
        {trace.contextVersion?.modelName ? <p>模型：{trace.contextVersion.modelName}</p> : null}
        {trace.errorCode ? <p className="text-[#8A2B24]">错误：{trace.errorCode}</p> : null}
        {trace.jobs.map((job) => (
          <p key={job.id}>{job.stage ?? "任务"} · {job.status} · {job.progress}%{job.errorCode ? ` · ${job.errorCode}` : ""}</p>
        ))}
      </div>
    </details>
  );
}

/** 旧会话保留历史消息原文；显示时补齐“任务建档”和“内容完成”的状态层级。 */
function clarifyLegacyTaskStatus(content: string): string {
  return content
    .replace(
      /已创建 (\d+) 个相互独立的平台创作任务。/g,
      "已建立 $1 个相互独立的平台任务，正在生成内容。",
    )
    .replace(
      /已创建 (\d+) 个独立创作任务。每个平台可以分别查看、重试和编辑。/g,
      "已建立 $1 个独立的平台任务并进入生成队列。作品完成后可分别查看、重试和编辑。",
    );
}

function hasLedgerEntries(value: unknown) {
  return Boolean(value && typeof value === "object" && Object.keys(value as Record<string, unknown>).length);
}
