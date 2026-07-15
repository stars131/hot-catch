"use client";

import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ArtifactCard as ArtifactCardType } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";
import { useTranslations } from "next-intl";

/**
 * 成果卡:展示已落库的 ContentRevision。
 * 「打开编辑」「继续优化」由客户端本地处理(打开 Artifact 面板 / 预填输入框),
 * 仍只传稳定 actionId;其余动作回传服务端注册表执行。
 */
export function ArtifactCardView(props: {
  card: ArtifactCardType;
  state: CardInvokeState;
  onInvoke: (actionId: string) => void;
  onOpen?: (card: ArtifactCardType) => void;
  onRefine?: (card: ArtifactCardType) => void;
}) {
  const t = useTranslations("Artifacts");
  const tp = useTranslations("Platforms");
  function handleAction(actionId: string) {
    if (actionId === "artifact.open" && props.onOpen) {
      props.onOpen(props.card);
      return;
    }
    if (actionId === "artifact.refine" && props.onRefine) {
      props.onRefine(props.card);
      return;
    }
    props.onInvoke(actionId);
  }

  return (
    <div
      className="mt-2 max-w-md rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-3.5"
      data-testid={`card-artifact-${props.card.id}`}
      data-state={props.state.phase}
    >
      <button
        type="button"
        className="flex w-full items-start gap-2.5 rounded-lg text-left"
        onClick={() => handleAction("artifact.open")}
        aria-label={t("openAria", { title: props.card.title })}
        data-testid="artifact-card-open-area"
      >
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#C83B32]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {props.card.title}
            </span>
            <span className="shrink-0 rounded bg-[#EDE9E0] px-1.5 py-0.5 font-mono text-[10px] text-[#67625A]">
              v{props.card.revisionNumber}
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-[#746F67]">
            {tp(props.card.platform)}
            {typeof props.card.score === "number" ? ` · ${t("score", { score: props.card.score })}` : ""}
          </span>
          {props.card.preview ? (
            <span className="mt-1.5 line-clamp-3 block text-xs leading-5 text-[#67625A]">
              {props.card.preview}
            </span>
          ) : null}
        </span>
      </button>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.card.actions.map((action) => (
          <Button
            key={action.actionId}
            size="sm"
            variant={action.appearance === "primary" ? "default" : "outline"}
            className={cn(
              "rounded-lg",
              action.appearance === "primary"
                ? "bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]"
                : "border-[#DDD7CE]",
            )}
            disabled={props.state.phase === "loading"}
            onClick={() => handleAction(action.actionId)}
            data-testid={`artifact-action-${action.actionId}`}
          >
            {props.state.phase === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {action.actionId === "artifact.open"
              ? t("open")
              : action.actionId === "artifact.refine"
                ? t("refine")
                : action.actionId === "publish.prepare"
                  ? t("preparePublish")
                  : action.label}
          </Button>
        ))}
        {props.state.phase === "failed" ? (
          <span className="self-center text-xs text-[#C83B32]">
            {props.state.error ?? t("failed")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
