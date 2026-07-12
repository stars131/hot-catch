"use client";

import {
  Download,
  FileText,
  Loader2,
  Redo2,
  Send,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ArtifactContentData,
  ArtifactRevision,
} from "@/hooks/creator/use-artifact";
import { RevisionMenu } from "@/components/creator/artifact/revision-menu";

const PLATFORM_LABEL = { xiaohongshu: "小红书图文", douyin: "抖音脚本" } as const;

/**
 * Artifact 固定顶栏:保存状态、版本、撤销/重做、评分、导出、准备发布、关闭。
 * 「准备发布」打开发布就绪清单(C8);真实发布仍在发布中心手动完成。
 */
export function ArtifactToolbar(props: {
  content: ArtifactContentData;
  title: string;
  viewRevision: ArtifactRevision | null;
  latestRevision: ArtifactRevision | null;
  dirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  busyAction: "restore" | "score" | "export" | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRetrySave: () => void;
  onViewRevision: (revisionId: string) => void;
  onRestoreRevision: (revisionId: string) => void;
  onExport: () => void;
  onShowScore: () => void;
  onPreparePublish: () => void;
  onClose: () => void;
}) {
  const saveLabel = props.dirty
    ? props.saveState === "saving"
      ? "保存中…"
      : props.saveState === "error"
        ? "保存失败"
        : "未保存"
    : props.saveState === "saving"
      ? "保存中…"
      : props.viewRevision
        ? `已保存 v${props.viewRevision.revisionNumber}`
        : "已保存";

  return (
    <div className="shrink-0 border-b border-[#E7E5E0] bg-[#FFFDF9] px-3.5 pb-2 pt-2.5">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-[#C83B32]" />
        <h2
          className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight"
          data-testid="artifact-panel-title"
          tabIndex={-1}
        >
          {props.title || "未命名内容"}
        </h2>
        <span className="shrink-0 rounded-lg border border-[#DDD7CE] bg-[#FAF9F6] px-1.5 py-0.5 text-[11px] text-[#746F67]">
          {PLATFORM_LABEL[props.content.platform]}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 rounded-lg"
          aria-label="关闭编辑面板"
          data-testid="artifact-panel-close"
          onClick={props.onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px]",
            props.saveState === "error"
              ? "bg-[#F7E3E1] text-[#8A2B24]"
              : props.dirty || props.saveState === "saving"
                ? "bg-[#F5EEDC] text-[#8A6414]"
                : "bg-[#E9EFE6] text-[#3F6B4F]",
          )}
          data-testid="artifact-save-state"
        >
          {props.saveState === "saving" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : null}
          {saveLabel}
        </span>
        {props.saveState === "error" ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-lg px-2 text-[11px] text-[#C83B32]"
            onClick={props.onRetrySave}
          >
            重试保存
          </Button>
        ) : null}

        <RevisionMenu
          revisions={props.content.revisions}
          currentId={props.viewRevision?.id ?? null}
          latestId={props.latestRevision?.id ?? null}
          disabled={props.busyAction !== null || props.saveState === "saving"}
          onView={props.onViewRevision}
          onRestore={props.onRestoreRevision}
        />

        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 rounded-lg"
          aria-label="撤销"
          disabled={!props.canUndo}
          onClick={props.onUndo}
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 rounded-lg"
          aria-label="重做"
          disabled={!props.canRedo}
          onClick={props.onRedo}
        >
          <Redo2 className="h-3.5 w-3.5" />
        </Button>

        <span className="mx-0.5 h-4 w-px bg-[#E7E5E0]" aria-hidden />

        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-lg px-2 font-mono text-[11px] text-[#67625A]"
          onClick={props.onShowScore}
          data-testid="artifact-score-badge"
        >
          {props.content.score ? `评分 ${props.content.score.total}` : "未评分"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-lg px-2 text-[11px] text-[#67625A]"
          disabled={props.busyAction === "export"}
          onClick={props.onExport}
          data-testid="artifact-export"
        >
          {props.busyAction === "export" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          导出
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 rounded-lg px-2 text-[11px] text-[#67625A]"
          onClick={props.onPreparePublish}
          data-testid="artifact-prepare-publish"
        >
          <Send className="h-3.5 w-3.5" /> 准备发布
        </Button>
      </div>
    </div>
  );
}
