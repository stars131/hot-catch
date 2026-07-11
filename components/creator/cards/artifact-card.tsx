"use client";

import { FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ArtifactCard as ArtifactCardType } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

const PLATFORM_LABEL = { xiaohongshu: "小红书图文", douyin: "抖音脚本" } as const;

/** 成果卡:展示已落库的 ContentRevision;完整编辑器在 C5 接入。 */
export function ArtifactCardView(props: {
  card: ArtifactCardType;
  state: CardInvokeState;
  onInvoke: (actionId: string) => void;
}) {
  return (
    <div
      className="mt-2 max-w-md rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-3.5"
      data-testid={`card-artifact-${props.card.id}`}
      data-state={props.state.phase}
    >
      <div className="flex items-start gap-2.5">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#C83B32]" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-medium">{props.card.title}</p>
            <span className="shrink-0 rounded bg-[#EDE9E0] px-1.5 py-0.5 font-mono text-[10px] text-[#67625A]">
              v{props.card.revisionNumber}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#746F67]">
            {PLATFORM_LABEL[props.card.platform]}
            {typeof props.card.score === "number" ? ` · 评分 ${props.card.score}/100` : ""}
          </p>
          {props.card.preview ? (
            <p className="mt-1.5 line-clamp-3 text-xs leading-5 text-[#67625A]">
              {props.card.preview}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {props.card.actions.map((action) => (
          <Button
            key={action.actionId}
            size="sm"
            variant={action.appearance === "primary" ? "default" : "outline"}
            className={cn(
              "rounded-lg",
              action.appearance === "primary" &&
                "bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]",
            )}
            disabled={props.state.phase === "loading"}
            onClick={() => props.onInvoke(action.actionId)}
          >
            {props.state.phase === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {action.label}
          </Button>
        ))}
        {props.state.phase === "failed" ? (
          <span className="self-center text-xs text-[#C83B32]">
            {props.state.error ?? "执行失败,可重试"}
          </span>
        ) : null}
      </div>
    </div>
  );
}
