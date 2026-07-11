"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Loader2, PenLine, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PatchCard } from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

/**
 * content.propose_patch 修改提案卡(C7)。
 *
 * - 显示目标区块、基于版本、指令与修改前/后预览;
 * - 「应用为新版本」「忽略」回传服务端动作(白名单 + 幂等);
 * - 「复制到编辑器」「再改一次」是客户端本地动作,不回传服务端;
 * - origin=local_preview 时明确标注本地协议预览,不冒充 AI 输出。
 */
export function PatchCardView(props: {
  card: PatchCard;
  state: CardInvokeState;
  processedActionIds: string[];
  onInvoke: (actionId: string) => void;
  /** 把提案文本写入 Artifact 编辑器草稿(客户端本地) */
  onCopyToEditor?: (card: PatchCard) => void;
  /** 带同一区块上下文再次发起修改(客户端本地) */
  onRefineAgain?: (card: PatchCard) => void;
}) {
  const { card } = props;
  const [expanded, setExpanded] = useState(false);
  const settled = props.processedActionIds.length > 0;
  const applied = props.processedActionIds.includes("patch.apply");
  const dismissed = props.processedActionIds.includes("patch.dismiss");
  const loading = props.state.phase === "loading";

  return (
    <div
      className="mt-3 max-w-xl rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-3.5"
      data-testid="patch-card"
      data-patch-status={applied ? "applied" : dismissed ? "dismissed" : "proposed"}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <PenLine className="h-4 w-4 shrink-0 text-[#C83B32]" aria-hidden />
        <span className="text-sm font-medium text-[#1F1D19]">
          修改提案:{card.sectionLabel}
        </span>
        <span className="font-mono text-[11px] text-[#746F67]">基于 v{card.revisionNumber}</span>
        <span
          className="rounded bg-[#F0EDE6] px-1.5 py-0.5 text-[10px] text-[#746F67]"
          title="由本地确定性规则生成的协议预览,不是 AI 改写结果"
        >
          本地协议预览
        </span>
        {applied ? (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-[#3D7A44]">
            <Check className="h-3.5 w-3.5" aria-hidden /> 已应用
          </span>
        ) : dismissed ? (
          <span className="ml-auto text-xs text-[#746F67]">已忽略</span>
        ) : null}
      </div>

      <p className="mt-1.5 text-xs leading-5 text-[#67625A]">
        <Wand2 className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />
        {card.instruction.length > 120 ? `${card.instruction.slice(0, 120)}…` : card.instruction}
      </p>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-[#E7E3DA] bg-[#FAF9F6] p-2.5">
          <p className="text-[11px] font-medium text-[#746F67]">修改前</p>
          <p
            className={cn(
              "mt-1 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#4A463F]",
              !expanded && "line-clamp-4",
            )}
            data-testid="patch-before"
          >
            {card.before}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-[#C9DCC9] bg-[#F4F8F3] p-2.5">
          <p className="text-[11px] font-medium text-[#3D7A44]">修改后(提案)</p>
          <p
            className={cn(
              "mt-1 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#2C4E31]",
              !expanded && "line-clamp-4",
            )}
            data-testid="patch-after"
          >
            {card.after}
          </p>
        </div>
      </div>
      {(card.before.length > 120 || card.after.length > 120) ? (
        <button
          type="button"
          className="mt-1.5 text-[11px] text-[#746F67] underline-offset-2 hover:underline"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "收起全文" : "展开全文"}
        </button>
      ) : null}

      {card.note ? (
        <p className="mt-2 text-[11px] leading-4 text-[#9C968C]">{card.note}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="rounded-lg bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]"
          disabled={settled || loading}
          onClick={() => props.onInvoke("patch.apply")}
          data-testid="patch-apply"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
          应用为新版本
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="rounded-lg text-[#746F67]"
          disabled={settled || loading}
          onClick={() => props.onInvoke("patch.dismiss")}
          data-testid="patch-dismiss"
        >
          <X className="h-3.5 w-3.5" aria-hidden /> 忽略
        </Button>
        {props.onCopyToEditor ? (
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg border-[#DDD7CE]"
            onClick={() => props.onCopyToEditor?.(card)}
            data-testid="patch-copy-editor"
          >
            <ClipboardCopy className="h-3.5 w-3.5" aria-hidden /> 复制到编辑器
          </Button>
        ) : null}
        {props.onRefineAgain ? (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-lg text-[#746F67]"
            onClick={() => props.onRefineAgain?.(card)}
            data-testid="patch-refine-again"
          >
            再改一次
          </Button>
        ) : null}
      </div>

      {props.state.phase === "failed" ? (
        <p className="mt-2 text-xs text-[#8A2B24]" role="alert">
          {props.state.error ?? "执行失败,请重试。"}
        </p>
      ) : null}
    </div>
  );
}
