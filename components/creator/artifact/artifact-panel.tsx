"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useArtifact, sourceLabel } from "@/hooks/creator/use-artifact";
import {
  artifactBlockAnchor,
  artifactSectionLabel,
  buildSectionRefinePrompt,
  patchSectionOf,
  scoreTargetOf,
  type ArtifactEditorTab,
  type ArtifactSectionRef,
} from "@/lib/creator/artifact-locator";
import { applySectionPatch, type PatchSection } from "@/lib/creator/patch-protocol";
import { ArtifactToolbar } from "@/components/creator/artifact/artifact-toolbar";
import { ArtifactContentTab } from "@/components/creator/artifact/artifact-content-tab";
import { ArtifactStructureTab } from "@/components/creator/artifact/artifact-structure-tab";
import { ScoreEvidencePanel } from "@/components/creator/artifact/score-evidence-panel";

/**
 * 「让星迹修改」请求:指令预填对话输入框;
 * target 存在时,发送后会走 content.propose_patch 提案卡路径。
 */
export type ArtifactRefineRequest = {
  instruction: string;
  sectionLabel: string;
  target?: {
    contentId: string;
    section: PatchSection;
    excerpt?: string;
  };
};

/** 「复制到编辑器」待写入的提案文本;nonce 变化时应用一次。 */
export type ArtifactPendingInsert = {
  nonce: number;
  section: PatchSection;
  before: string;
  after: string;
};

/**
 * Artifact 面板:内容 / 结构 / 评分与证据三个主标签 + 固定顶栏。
 * 桌面(≥1180px)作为右侧栏,窄屏与手机全屏覆盖;由外层容器决定,面板单实例。
 * 「内容」是结构化编辑器,「结构」是只读大纲;查看历史版本进入只读预览。
 */
export function ArtifactPanel(props: {
  contentId: string;
  onClose: () => void;
  /** 「让星迹修改」把指令与区块引用交给对话侧;未提供时隐藏该入口 */
  onAskRefine?: (request: ArtifactRefineRequest) => void;
  /** 补丁卡「复制到编辑器」待写入的提案 */
  pendingInsert?: ArtifactPendingInsert | null;
}) {
  const artifact = useArtifact(props.contentId);
  const [tab, setTab] = useState<ArtifactEditorTab>("content");
  const [insertNotice, setInsertNotice] = useState<string | null>(null);
  const appliedInsertNonceRef = useRef(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // 打开时移入焦点,关闭时还原
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    rootRef.current
      ?.querySelector<HTMLElement>('[data-testid="artifact-panel-title"]')
      ?.focus();
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [props.contentId]);

  // Esc 关闭(输入控件内除外,避免打断输入法/文本编辑)
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (!rootRef.current?.contains(target)) return;
      props.onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [props]);

  /** 切换标签并滚动高亮目标块;供评分警告定位与结构大纲跳转共用。 */
  const jumpToAnchor = useCallback(
    (targetTab: Exclude<ArtifactEditorTab, "score">, anchor: string) => {
      setTab(targetTab);
      window.setTimeout(() => {
        const element = rootRef.current?.querySelector<HTMLElement>(
          `[data-artifact-block="${anchor}"]`,
        );
        if (!element) return;
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.remove("artifact-flash");
        // 触发重绘,保证连续点击同一警告也会重新高亮
        void element.offsetWidth;
        element.classList.add("artifact-flash");
        window.setTimeout(() => element.classList.remove("artifact-flash"), 1700);
      }, 80);
    },
    [],
  );

  const locate = useCallback(
    (dimensionKey: string) => {
      const kind = artifact.content?.contentKind;
      if (!kind) return;
      const target = scoreTargetOf(kind, dimensionKey);
      if (!target) return;
      jumpToAnchor(target.tab, artifactBlockAnchor(target.blockId));
    },
    [artifact.content?.contentKind, jumpToAnchor],
  );

  const handleAskRefine = useCallback(
    (section: ArtifactSectionRef, options?: { detail?: string; excerpt?: string }) => {
      const kind = artifact.content?.contentKind;
      if (!kind || !props.onAskRefine) return;
      const patchSection = patchSectionOf(section);
      const rawExcerpt = (options?.excerpt ?? "").trim();
      props.onAskRefine({
        instruction: buildSectionRefinePrompt({
          contentKind: kind,
          section,
          revisionNumber: artifact.viewRevision?.revisionNumber ?? null,
          detail: options?.detail,
          excerpt: options?.excerpt,
        }),
        sectionLabel: artifactSectionLabel(kind, section, options?.detail),
        // cover/tags/risk 暂不支持补丁提案,退回普通对话预填
        target: patchSection
          ? {
              contentId: props.contentId,
              section: patchSection,
              excerpt: rawExcerpt ? rawExcerpt.slice(0, 500) : undefined,
            }
          : undefined,
      });
    },
    [artifact.content?.contentKind, artifact.viewRevision?.revisionNumber, props],
  );

  // 补丁卡「复制到编辑器」:把提案写入当前草稿(等同手动编辑,走自动保存);
  // 区块文本已变化或处于只读预览时不写入,给出明确提示,不静默覆盖。
  useEffect(() => {
    const insert = props.pendingInsert;
    if (!insert || insert.nonce === appliedInsertNonceRef.current) return;
    if (artifact.loadState !== "ready") return;
    appliedInsertNonceRef.current = insert.nonce;
    if (artifact.previewing) {
      setInsertNotice("正在查看历史版本(只读),请先回到最新版再复制提案。");
      return;
    }
    const patched = applySectionPatch(artifact.draft, insert.section, insert.before, insert.after);
    if (!patched) {
      setInsertNotice("提案对应的文本在编辑器中已变化,没有写入;可重新发起「让星迹修改」。");
      return;
    }
    artifact.editDraft(patched);
    setInsertNotice("已把提案文本复制到编辑器,会作为手动修改自动保存。");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.pendingInsert, artifact.loadState, artifact.previewing]);

  const handleExport = useCallback(async () => {
    const exported = await artifact.exportMarkdown();
    if (!exported) return;
    const blob = new Blob([exported.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exported.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [artifact]);

  return (
    <div
      ref={rootRef}
      role="complementary"
      aria-label="成果编辑面板"
      data-testid="artifact-panel"
      className="flex h-full min-h-0 w-full flex-col bg-[#FFFDF9]"
    >
      {artifact.loadState === "loading" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-[#746F67]">
          <Loader2 className="h-5 w-5 animate-spin text-[#C83B32]" />
          正在加载内容…
          <Button variant="ghost" size="sm" className="rounded-lg" onClick={props.onClose}>
            关闭
          </Button>
        </div>
      ) : artifact.loadState === "error" || !artifact.content ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertTriangle className="h-6 w-6 text-[#C83B32]" />
          <p className="text-sm leading-6 text-[#746F67]">
            {artifact.loadError ?? "内容不存在,或不属于当前账号。"}
          </p>
          <Button variant="outline" size="sm" className="rounded-lg" onClick={props.onClose}>
            关闭面板
          </Button>
        </div>
      ) : (
        <>
          <ArtifactToolbar
            content={artifact.content}
            title={artifact.draft.title || artifact.viewRevision?.title || artifact.content.title || ""}
            viewRevision={artifact.viewRevision}
            latestRevision={artifact.latestRevision}
            dirty={artifact.dirty}
            saveState={artifact.saveState}
            busyAction={artifact.busyAction}
            canUndo={artifact.canUndo}
            canRedo={artifact.canRedo}
            onUndo={artifact.undo}
            onRedo={artifact.redo}
            onRetrySave={() => void artifact.saveNow()}
            onViewRevision={(id) => void artifact.viewRevisionById(id)}
            onRestoreRevision={(id) => void artifact.restoreRevision(id)}
            onExport={() => void handleExport()}
            onShowScore={() => setTab("score")}
            onClose={props.onClose}
          />

          {artifact.previewing && artifact.viewRevision ? (
            <div
              className="mx-3.5 mt-3 rounded-xl border border-[#DDD7CE] bg-[#F5F4F1] p-3"
              data-testid="artifact-preview-banner"
              role="status"
            >
              <p className="flex items-center gap-1.5 text-sm font-medium text-[#67625A]">
                <Eye className="h-4 w-4 shrink-0" aria-hidden />
                正在查看历史版本 v{artifact.viewRevision.revisionNumber}(
                {sourceLabel(artifact.viewRevision.source)}),内容只读。
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg border-[#DDD7CE]"
                  disabled={artifact.busyAction !== null}
                  onClick={() =>
                    void artifact.restoreRevision(artifact.viewRevision!.id)
                  }
                  data-testid="artifact-preview-restore"
                >
                  恢复此版本
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-lg text-[#67625A]"
                  onClick={() => void artifact.viewLatest()}
                  data-testid="artifact-preview-back-latest"
                >
                  回到最新版
                </Button>
              </div>
            </div>
          ) : null}

          {artifact.conflict ? (
            <div
              className="mx-3.5 mt-3 rounded-xl border border-[#D9A441]/60 bg-[#FDF6E7] p-3"
              data-testid="artifact-conflict"
              role="alert"
            >
              <p className="text-sm font-medium text-[#6B4E0F]">
                生成完成:v{artifact.conflict.incoming.revisionNumber}(
                {sourceLabel(artifact.conflict.incoming.source)})已创建。
              </p>
              <p className="mt-1 text-xs leading-5 text-[#8A6414]">
                {artifact.dirty
                  ? "你有未保存的修改,不会被覆盖:可以另存为新版本,或放弃并切换到生成结果。"
                  : "你正在编辑自己的版本,不会被自动切换;生成结果已保存在版本历史中。"}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="rounded-lg bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]"
                  onClick={() => void artifact.resolveConflictKeepMine()}
                  data-testid="artifact-conflict-keep-mine"
                >
                  {artifact.dirty ? "把我的修改保存为新版本" : "保留我的版本"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-lg border-[#DDD7CE]"
                  onClick={artifact.resolveConflictUseIncoming}
                  data-testid="artifact-conflict-use-incoming"
                >
                  切换到 v{artifact.conflict.incoming.revisionNumber}
                  {artifact.dirty ? "(放弃未保存修改)" : ""}
                </Button>
              </div>
            </div>
          ) : null}

          {artifact.updateNotice ? (
            <div
              className="mx-3.5 mt-3 flex items-start gap-2 rounded-xl border border-[#DDD7CE] bg-[#FAF9F6] px-3 py-2 text-xs leading-5 text-[#67625A]"
              data-testid="artifact-update-notice"
            >
              <span className="min-w-0 flex-1">{artifact.updateNotice}</span>
              <button
                type="button"
                className="shrink-0 text-[#9C968C] hover:text-[#67625A]"
                onClick={artifact.dismissNotice}
              >
                知道了
              </button>
            </div>
          ) : null}

          {insertNotice ? (
            <div
              className="mx-3.5 mt-3 flex items-start gap-2 rounded-xl border border-[#DDD7CE] bg-[#FAF9F6] px-3 py-2 text-xs leading-5 text-[#67625A]"
              data-testid="artifact-insert-notice"
              role="status"
            >
              <span className="min-w-0 flex-1">{insertNotice}</span>
              <button
                type="button"
                className="shrink-0 text-[#9C968C] hover:text-[#67625A]"
                onClick={() => setInsertNotice(null)}
              >
                知道了
              </button>
            </div>
          ) : null}

          {artifact.saveError && artifact.saveState !== "error" ? (
            <p className="mx-3.5 mt-3 rounded-xl bg-[#F7E3E1] px-3 py-2 text-xs text-[#8A2B24]">
              {artifact.saveError}
            </p>
          ) : null}

          <Tabs
            value={tab}
            onValueChange={(value) => setTab(value as ArtifactEditorTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-3.5 mt-3 shrink-0 self-start rounded-xl bg-[#F0EDE6]">
              <TabsTrigger value="content" className="rounded-lg text-xs">
                内容
              </TabsTrigger>
              <TabsTrigger value="structure" className="rounded-lg text-xs">
                结构
              </TabsTrigger>
              <TabsTrigger value="score" className="rounded-lg text-xs">
                评分与证据
              </TabsTrigger>
            </TabsList>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <TabsContent value="content" className="mt-0">
                <ArtifactContentTab
                  content={artifact.content}
                  draft={artifact.draft}
                  readOnly={artifact.previewing}
                  onEdit={artifact.editDraft}
                  onAskRefine={handleAskRefine}
                />
              </TabsContent>
              <TabsContent value="structure" className="mt-0">
                <ArtifactStructureTab
                  contentKind={artifact.content.contentKind}
                  structuredContent={
                    artifact.draft.structured ??
                    artifact.viewRevision?.structuredContent ??
                    null
                  }
                  onJumpTo={(anchor) => jumpToAnchor("content", anchor)}
                />
              </TabsContent>
              <TabsContent value="score" className="mt-0">
                <ScoreEvidencePanel
                  content={artifact.content}
                  busyAction={artifact.busyAction}
                  onRescore={() => void artifact.rescore()}
                  onLocate={locate}
                />
              </TabsContent>
            </div>
          </Tabs>
        </>
      )}
    </div>
  );
}
