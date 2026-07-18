"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Eye, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  sourceLabel,
  type ArtifactRevision,
} from "@/hooks/creator/use-artifact";

/**
 * 版本菜单:查看历史版本(不置 dirty)与恢复(服务端按版本 payload 建新版)。
 */
export function RevisionMenu(props: {
  revisions: ArtifactRevision[];
  currentId: string | null;
  latestId: string | null;
  disabled?: boolean;
  onView: (revisionId: string) => void;
  onRestore: (revisionId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // 捕获阶段消费 Esc:只关菜单,不让面板级 Esc 处理器把整个面板关掉
      event.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const current = props.revisions.find((revision) => revision.id === props.currentId);

  return (
    <div ref={rootRef} className="relative">
      <Button
        size="sm"
        variant="outline"
        className="rounded-lg border-[#DDD7CE] font-mono text-xs"
        disabled={props.disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="artifact-revision-menu-trigger"
        onClick={() => setOpen((value) => !value)}
      >
        v{current?.revisionNumber ?? "-"}
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open ? (
        <div
          role="listbox"
          aria-label="历史版本"
          data-testid="artifact-revision-menu"
          className="absolute right-0 top-full z-30 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-1.5 shadow-lg"
        >
          {props.revisions.length === 0 ? (
            <p className="px-2.5 py-3 text-xs text-[#746F67]">还没有版本。</p>
          ) : (
            props.revisions.map((revision) => {
              const isCurrent = revision.id === props.currentId;
              const isLatest = revision.id === props.latestId;
              return (
                <div
                  key={revision.id}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-2.5 py-2",
                    isCurrent && "bg-[#F0EDE6]",
                  )}
                  data-testid={`artifact-revision-item-${revision.revisionNumber}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-medium">
                      <span className="font-mono">v{revision.revisionNumber}</span>
                      <span className="rounded bg-[#EDE9E0] px-1 py-0.5 text-[10px] text-[#67625A]">
                        {sourceLabel(revision.source)}
                      </span>
                      {isLatest ? (
                        <span className="text-[10px] text-[#4A7C59]">最新</span>
                      ) : null}
                      {isCurrent ? (
                        <span className="text-[10px] text-[#C83B32]">当前</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-[#746F67]">
                      {revision.title || "未命名"} ·{" "}
                      {new Date(revision.createdAt).toLocaleString("zh-CN", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 rounded-lg px-2 text-[11px] text-[#67625A]"
                    disabled={props.disabled || isCurrent}
                    onClick={() => {
                      setOpen(false);
                      props.onView(revision.id);
                    }}
                  >
                    <Eye className="h-3.5 w-3.5" /> 查看
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 rounded-lg px-2 text-[11px] text-[#67625A]"
                    disabled={props.disabled || isLatest}
                    title={isLatest ? "已是最新版本" : `以 v${revision.revisionNumber} 的内容创建新版本`}
                    onClick={() => {
                      setOpen(false);
                      props.onRestore(revision.id);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> 恢复
                  </Button>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
