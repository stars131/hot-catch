"use client";

import { useEffect, useRef } from "react";
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
import type {
  ArtifactCard,
  PatchCard,
  PublishReadinessCard,
} from "@/lib/creator/chat-protocol";
import type { ActiveRun, ThreadMessage } from "@/lib/creator/conversation-client";
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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [props.messages.length, props.busy]);

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
          className="mt-6 rounded-lg bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]"
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
      <ul className="space-y-5" aria-live="polite">
        {props.messages.map((message, index) => (
          <li key={message.id} data-role={message.role} data-status={message.status}>
            {message.role === "user" ? (
              <div className="ml-auto w-fit max-w-[85%] rounded-xl bg-[#EDE9E0] px-3.5 py-2.5 text-[15px] leading-7">
                {message.content}
              </div>
            ) : (
              <div className="max-w-none">
                {message.status === "pending" ? (
                  <p className="flex items-center gap-2 text-sm text-[#746F67]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#C83B32]" />
                    星迹正在处理…
                  </p>
                ) : (
                  <p
                    className={cn(
                      "whitespace-pre-wrap text-[15px] leading-7 text-[#1F1D19]",
                      message.status === "failed" && "text-[#8A2B24]",
                    )}
                  >
                    {message.content}
                  </p>
                )}
                {message.status === "failed" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 rounded-lg border-[#DDD7CE]"
                    onClick={() => props.onRetry(props.messages[index - 1] ?? message)}
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
        ))}
        {props.busy ? (
          <li className="flex items-center gap-2 text-sm text-[#746F67]">
            <Loader2 className="h-4 w-4 animate-spin text-[#C83B32]" /> 星迹正在思考…
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
                上一次请求仍在处理中…
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
