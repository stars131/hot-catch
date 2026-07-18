"use client";

import { useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  artifactBlockAnchor,
  artifactItemAnchor,
  type ArtifactSectionRef,
} from "@/lib/creator/artifact-locator";
import {
  formatSeconds,
  shotIssuesAt,
  validateStoryboard,
} from "@/lib/content/storyboard";
import type { ArtifactDraft } from "@/hooks/creator/use-artifact";
import {
  DisclosureRow,
  EditorBlock,
  RefineButton,
  StringListEditor,
  TagChipsEditor,
  selectionOf,
  useViewportBelow,
} from "@/components/creator/artifact/editor-blocks";

/**
 * 抖音脚本分镜时间轴编辑器。
 * 默认每镜只露出时间、口播、画面、字幕;镜头/转场/音乐/风险在「高级项」。
 * 桌面点击单镜行内展开;手机点击进入全屏单镜编辑。
 * 时间连续性与总时长即时校验(规则与生成 Schema 一致)。
 */
export function DouyinStoryboardEditor(props: {
  draft: ArtifactDraft;
  readOnly: boolean;
  onEdit: (patch: Partial<ArtifactDraft>) => void;
  onAskRefine: (
    section: ArtifactSectionRef,
    options?: { detail?: string; excerpt?: string },
  ) => void;
}) {
  const structured = props.draft.structured ?? {};
  const shots = recordArray(structured.shots);
  const tags = stringArray(structured.tags);
  const riskNotes = stringArray(structured.riskNotes);
  const hook = stringOf(structured.hook);
  const durationSec = numberOf(structured.durationSec);

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  const isMobile = useViewportBelow(768);
  const captionRef = useRef<HTMLTextAreaElement | null>(null);

  const validation = validateStoryboard(structured);
  const overallIssues = validation.issues.filter((issue) => issue.shotIndex === null);

  function patchStructured(patch: Record<string, unknown>) {
    props.onEdit({ structured: { ...structured, ...patch } });
  }

  function patchShot(index: number, patch: Record<string, unknown>) {
    patchStructured({
      shots: shots.map((shot, shotIndex) =>
        shotIndex === index ? { ...shot, ...patch } : shot,
      ),
    });
  }

  function addShotAfter(index: number) {
    const anchorEnd = index >= 0 ? numberOf(shots[index]?.endSec) : 0;
    const next = [...shots];
    next.splice(index + 1, 0, {
      startSec: anchorEnd,
      endSec: anchorEnd + 3,
      voiceover: "",
      visual: "",
      subtitle: "",
      camera: "",
      transition: "",
      music: "",
      risk: "",
    });
    patchStructured({ shots: next });
    setExpandedIndex(isMobile ? null : index + 1);
    if (isMobile) setSheetIndex(index + 1);
  }

  function removeShot(index: number) {
    patchStructured({ shots: shots.filter((_, shotIndex) => shotIndex !== index) });
    setExpandedIndex(null);
    setSheetIndex(null);
  }

  function openShot(index: number) {
    if (isMobile) setSheetIndex(index);
    else setExpandedIndex((current) => (current === index ? null : index));
  }

  function shotTimeLabel(shot: Record<string, unknown>): string {
    return `${formatSeconds(numberOf(shot.startSec))}–${formatSeconds(numberOf(shot.endSec))}`;
  }

  function askRefineShot(index: number) {
    props.onAskRefine(
      { kind: "shot", index },
      { detail: shotTimeLabel(shots[index] ?? {}) },
    );
  }

  const sheetShot = sheetIndex !== null ? shots[sheetIndex] : undefined;

  return (
    <div className="space-y-5 px-3.5 py-4">
      <EditorBlock
        anchor={artifactBlockAnchor("title")}
        label="标题"
        labelFor="artifact-title"
        onAskRefine={
          props.readOnly ? undefined : () => props.onAskRefine({ kind: "title" })
        }
      >
        <Input
          id="artifact-title"
          className="rounded-xl border-[#DDD7CE] bg-white text-sm"
          value={props.draft.title}
          maxLength={200}
          disabled={props.readOnly}
          onChange={(event) => props.onEdit({ title: event.target.value })}
        />
      </EditorBlock>

      <EditorBlock
        anchor={artifactBlockAnchor("hook")}
        label="开场钩子"
        labelFor="artifact-hook"
        hint="前三秒抓住观众"
        onAskRefine={
          props.readOnly ? undefined : () => props.onAskRefine({ kind: "hook" })
        }
      >
        <Textarea
          id="artifact-hook"
          className="min-h-[56px] rounded-xl border-[#DDD7CE] bg-white text-sm leading-6"
          value={hook}
          disabled={props.readOnly}
          placeholder="开场如何抓住注意力"
          onChange={(event) => patchStructured({ hook: event.target.value })}
        />
      </EditorBlock>

      <EditorBlock
        anchor={artifactBlockAnchor("shots")}
        label={`分镜时间轴(${shots.length} 镜)`}
        actions={
          !props.readOnly && shots.length === 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-[#746F67] hover:bg-[#F0EDE6] hover:text-[#1F1D19]"
              onClick={() => addShotAfter(-1)}
            >
              <Plus className="h-3 w-3" aria-hidden /> 添加第一镜
            </button>
          ) : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[#E7E5E0] bg-[#FAF9F6] px-2.5 py-2">
          <label
            htmlFor="artifact-duration"
            className="text-xs font-medium text-[#67625A]"
          >
            总时长
          </label>
          <span className="inline-flex items-center gap-1">
            <Input
              id="artifact-duration"
              type="number"
              min={0}
              step={1}
              value={durationSec}
              disabled={props.readOnly}
              className="h-7 w-20 rounded-lg border-[#DDD7CE] bg-white text-right font-mono text-xs"
              onChange={(event) => {
                const value = event.target.valueAsNumber;
                patchStructured({ durationSec: Number.isFinite(value) ? value : 0 });
              }}
            />
            <span className="text-xs text-[#67625A]">秒</span>
          </span>
          <span className="font-mono text-[11px] text-[#9C968C]" data-testid="artifact-timeline-end">
            尾镜结束于 {formatSeconds(validation.timelineEnd)}
          </span>
          {!props.readOnly &&
          shots.length > 0 &&
          Math.abs(validation.timelineEnd - durationSec) > 1 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-6 rounded-lg border-[#DDD7CE] px-2 text-[11px]"
              onClick={() => patchStructured({ durationSec: validation.timelineEnd })}
              data-testid="artifact-align-duration"
            >
              对齐尾镜
            </Button>
          ) : null}
        </div>

        {validation.issues.length > 0 ? (
          <div
            className="mt-2 rounded-xl border border-[#D9A441]/50 bg-[#FDF6E7] px-2.5 py-2"
            data-testid="artifact-storyboard-issues"
            role="status"
          >
            <p className="flex items-center gap-1 text-xs font-medium text-[#8A6414]">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              时间轴有 {validation.issues.length} 个问题
            </p>
            <ul className="mt-1 space-y-0.5 pl-5 text-[11px] leading-5 text-[#8A6414]">
              {[...overallIssues, ...validation.issues.filter((issue) => issue.shotIndex !== null)].map(
                (issue, index) => (
                  <li key={index}>· {issue.message}</li>
                ),
              )}
            </ul>
          </div>
        ) : null}

        <div className="mt-2 space-y-1.5">
          {shots.length === 0 ? (
            <p className="text-xs text-[#9C968C]">该版本没有分镜结构。</p>
          ) : (
            shots.map((shot, index) => (
              <ShotRow
                key={index}
                index={index}
                shot={shot}
                issues={shotIssuesAt(validation, index)}
                expanded={!isMobile && expandedIndex === index}
                readOnly={props.readOnly}
                onOpen={() => openShot(index)}
                onPatch={(patch) => patchShot(index, patch)}
                onAdd={() => addShotAfter(index)}
                onRemove={() => removeShot(index)}
                onAskRefine={() => askRefineShot(index)}
              />
            ))
          )}
        </div>
      </EditorBlock>

      <EditorBlock
        anchor={artifactBlockAnchor("body")}
        label="发布文案"
        labelFor="artifact-body"
        onAskRefine={
          props.readOnly
            ? undefined
            : () =>
                props.onAskRefine(
                  { kind: "body" },
                  { excerpt: selectionOf(captionRef.current) },
                )
        }
      >
        <Textarea
          id="artifact-body"
          ref={captionRef}
          className="min-h-[120px] rounded-xl border-[#DDD7CE] bg-white text-sm leading-7"
          value={props.draft.body}
          disabled={props.readOnly}
          onChange={(event) => props.onEdit({ body: event.target.value })}
        />
      </EditorBlock>

      <EditorBlock
        anchor={artifactBlockAnchor("tags")}
        label={`标签(${tags.length})`}
        onAskRefine={
          props.readOnly ? undefined : () => props.onAskRefine({ kind: "tags" })
        }
      >
        <TagChipsEditor
          tags={tags}
          readOnly={props.readOnly}
          onChange={(next) => patchStructured({ tags: next })}
        />
      </EditorBlock>

      <EditorBlock
        anchor={artifactBlockAnchor("risk")}
        label="风险说明"
        onAskRefine={
          props.readOnly ? undefined : () => props.onAskRefine({ kind: "risk" })
        }
      >
        <StringListEditor
          items={riskNotes}
          readOnly={props.readOnly}
          onChange={(items) => patchStructured({ riskNotes: items })}
          itemLabel="风险说明"
          addLabel="添加风险说明"
          emptyText="该版本没有记录风险说明。"
        />
      </EditorBlock>

      {/* 手机:单镜全屏编辑;关闭只关本 Sheet,不影响 Artifact 面板 */}
      <Sheet
        open={sheetIndex !== null}
        onOpenChange={(open) => {
          if (!open) setSheetIndex(null);
        }}
      >
        <SheetContent
          side="bottom"
          className="flex h-[94dvh] flex-col rounded-t-2xl border-[#DDD7CE] bg-[#FFFDF9] p-0"
          data-testid="artifact-shot-sheet"
        >
          {sheetIndex !== null && sheetShot ? (
            <>
              {/* pr-12 给 Sheet 自带的右上角关闭按钮留位,避免与「让星迹修改」重叠 */}
              <div className="flex items-center gap-2 border-b border-[#E7E5E0] py-3 pl-4 pr-12">
                <SheetTitle className="flex-1 text-sm font-semibold">
                  第 {sheetIndex + 1} 镜 ·{" "}
                  <span className="font-mono text-xs text-[#67625A]">
                    {shotTimeLabel(sheetShot)}
                  </span>
                </SheetTitle>
                {!props.readOnly ? (
                  <RefineButton
                    label={`让星迹修改第 ${sheetIndex + 1} 镜`}
                    onClick={() => {
                      askRefineShot(sheetIndex);
                      setSheetIndex(null);
                    }}
                  />
                ) : null}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <ShotFields
                  index={sheetIndex}
                  shot={sheetShot}
                  issues={shotIssuesAt(validation, sheetIndex)}
                  readOnly={props.readOnly}
                  advancedAlwaysOpen
                  onPatch={(patch) => patchShot(sheetIndex, patch)}
                />
              </div>
              <div className="flex items-center gap-2 border-t border-[#E7E5E0] px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
                {!props.readOnly ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-[#DDD7CE] text-xs"
                      onClick={() => addShotAfter(sheetIndex)}
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden /> 在此镜后加镜
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg border-[#DDD7CE] text-xs text-[#8A2B24]"
                      onClick={() => removeShot(sheetIndex)}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> 删除
                    </Button>
                  </>
                ) : null}
                <Button
                  size="sm"
                  className="ml-auto rounded-lg bg-[#C83B32] text-xs text-[#FFFDF9] hover:bg-[#B3352D]"
                  onClick={() => setSheetIndex(null)}
                  data-testid="artifact-shot-sheet-done"
                >
                  完成
                </Button>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** 单镜行:折叠时只显示时间/口播/画面/字幕;桌面行内展开编辑。 */
function ShotRow(props: {
  index: number;
  shot: Record<string, unknown>;
  issues: string[];
  expanded: boolean;
  readOnly: boolean;
  onOpen: () => void;
  onPatch: (patch: Record<string, unknown>) => void;
  onAdd: () => void;
  onRemove: () => void;
  onAskRefine: () => void;
}) {
  const shotLabel = `第 ${props.index + 1} 镜`;
  const timeLabel = `${formatSeconds(numberOf(props.shot.startSec))}–${formatSeconds(
    numberOf(props.shot.endSec),
  )}`;

  return (
    <section
      data-artifact-block={artifactItemAnchor("shots", props.index)}
      data-testid={`artifact-shot-${props.index + 1}`}
      className={cn(
        "rounded-xl border bg-[#FFFDF9]",
        props.issues.length > 0 ? "border-[#D9A441]/60" : "border-[#E7E5E0]",
      )}
    >
      <div className="flex items-start gap-1.5 p-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-[#F5F2EB]"
          aria-expanded={props.expanded}
          aria-label={`编辑${shotLabel}`}
          data-testid={`artifact-shot-open-${props.index + 1}`}
          onClick={props.onOpen}
        >
          <span className="mt-0.5 shrink-0 rounded bg-[#EDE9E0] px-1.5 py-0.5 font-mono text-[11px] text-[#67625A]">
            {timeLabel}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm leading-6">
              {stringOf(props.shot.voiceover) || (
                <span className="text-[#9C968C]">未填写口播</span>
              )}
            </span>
            <span className="block truncate text-[11px] leading-4 text-[#9C968C]">
              画面:{stringOf(props.shot.visual) || "未填写"} · 字幕:
              {stringOf(props.shot.subtitle) || "未填写"}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "mt-1 h-3.5 w-3.5 shrink-0 text-[#9C968C] transition-transform",
              props.expanded ? "rotate-180" : "rotate-0",
            )}
          />
        </button>
        {!props.readOnly ? (
          <RefineButton
            label={`让星迹修改${shotLabel}`}
            className="mt-0.5"
            onClick={props.onAskRefine}
          />
        ) : null}
      </div>

      {props.issues.length > 0 && !props.expanded ? (
        <p className="px-3 pb-2 text-[11px] leading-4 text-[#8A6414]">
          {props.issues.join(" ")}
        </p>
      ) : null}

      {props.expanded ? (
        <div className="border-t border-[#F0EDE6] px-3 py-2.5">
          <ShotFields
            index={props.index}
            shot={props.shot}
            issues={props.issues}
            readOnly={props.readOnly}
            onPatch={props.onPatch}
          />
          {!props.readOnly ? (
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-[#746F67] hover:bg-[#F0EDE6] hover:text-[#1F1D19]"
                onClick={props.onAdd}
              >
                <Plus className="h-3 w-3" aria-hidden /> 在此镜后加镜
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-[#9C968C] hover:bg-[#F0EDE6] hover:text-[#8A2B24]"
                onClick={props.onRemove}
              >
                <Trash2 className="h-3 w-3" aria-hidden /> 删除此镜
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** 单镜字段:时间/口播/画面/字幕 + 高级项(镜头/转场/音乐/风险)。 */
function ShotFields(props: {
  index: number;
  shot: Record<string, unknown>;
  issues: string[];
  readOnly: boolean;
  advancedAlwaysOpen?: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const shotLabel = `第 ${props.index + 1} 镜`;

  function numberField(field: "startSec" | "endSec", label: string): ReactNode {
    return (
      <label className="flex items-center gap-1.5 text-xs text-[#67625A]">
        {label}
        <Input
          type="number"
          min={0}
          step={0.1}
          value={numberOf(props.shot[field])}
          disabled={props.readOnly}
          aria-label={`${shotLabel}${label}(秒)`}
          className="h-7 w-20 rounded-lg border-[#DDD7CE] bg-white text-right font-mono text-xs"
          onChange={(event) => {
            const value = event.target.valueAsNumber;
            props.onPatch({ [field]: Number.isFinite(value) ? value : 0 });
          }}
        />
        <span aria-hidden>秒</span>
      </label>
    );
  }

  function textField(
    field: "voiceover" | "visual" | "subtitle",
    label: string,
    rows: number,
  ): ReactNode {
    return (
      <div>
        <label
          htmlFor={`shot-${props.index}-${field}`}
          className="text-[11px] font-medium text-[#67625A]"
        >
          {label}
        </label>
        <Textarea
          id={`shot-${props.index}-${field}`}
          value={stringOf(props.shot[field])}
          disabled={props.readOnly}
          rows={rows}
          className="mt-0.5 min-h-0 rounded-lg border-[#EDE9E0] bg-white text-sm leading-6"
          onChange={(event) => props.onPatch({ [field]: event.target.value })}
        />
      </div>
    );
  }

  function advancedField(
    field: "camera" | "transition" | "music" | "risk",
    label: string,
  ): ReactNode {
    return (
      <div>
        <label
          htmlFor={`shot-${props.index}-${field}`}
          className="text-[11px] font-medium text-[#67625A]"
        >
          {label}
        </label>
        <Input
          id={`shot-${props.index}-${field}`}
          value={stringOf(props.shot[field])}
          disabled={props.readOnly}
          className="mt-0.5 h-8 rounded-lg border-[#EDE9E0] bg-white text-sm"
          onChange={(event) => props.onPatch({ [field]: event.target.value })}
        />
      </div>
    );
  }

  const advanced = (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {advancedField("camera", "镜头")}
      {advancedField("transition", "转场")}
      {advancedField("music", "音乐")}
      {advancedField("risk", "本镜风险")}
    </div>
  );

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {numberField("startSec", "开始")}
        {numberField("endSec", "结束")}
      </div>
      {props.issues.length > 0 ? (
        <p className="text-[11px] leading-4 text-[#8A6414]" role="status">
          {props.issues.join(" ")}
        </p>
      ) : null}
      {textField("voiceover", "口播", 2)}
      {textField("visual", "画面", 2)}
      {textField("subtitle", "字幕", 1)}
      {props.advancedAlwaysOpen ? (
        <div>
          <p className="text-[11px] font-medium text-[#67625A]">高级项</p>
          <div className="mt-1">{advanced}</div>
        </div>
      ) : (
        <DisclosureRow
          label="高级项(镜头/转场/音乐/风险)"
          open={advancedOpen}
          onToggle={() => setAdvancedOpen((open) => !open)}
        >
          {advanced}
        </DisclosureRow>
      )}
    </div>
  );
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : {},
      )
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
