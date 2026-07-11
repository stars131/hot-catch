"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  artifactBlockAnchor,
  artifactItemAnchor,
  type ArtifactSectionRef,
} from "@/lib/creator/artifact-locator";
import type { ArtifactDraft } from "@/hooks/creator/use-artifact";
import {
  DisclosureRow,
  EditorBlock,
  RefineButton,
  StringListEditor,
  TagChipsEditor,
  selectionOf,
} from "@/components/creator/artifact/editor-blocks";

/**
 * 小红书图文结构化编辑器:按真实阅读顺序渐进编辑。
 * 标题(含备选) → 封面文案 → 分页 → 完整正文 → 互动收尾 → 标签 → 风险。
 * 每页默认露出小标题与正文,视觉建议按需展开;所有区块可「让星迹修改」。
 */
export function XhsGraphicEditor(props: {
  draft: ArtifactDraft;
  readOnly: boolean;
  onEdit: (patch: Partial<ArtifactDraft>) => void;
  onAskRefine: (
    section: ArtifactSectionRef,
    options?: { detail?: string; excerpt?: string },
  ) => void;
}) {
  const structured = props.draft.structured ?? {};
  const pages = recordArray(structured.pages);
  const titleOptions = stringArray(structured.titleOptions);
  const coverOptions = stringArray(structured.coverTextOptions);
  const tags = stringArray(structured.tags);
  const riskNotes = stringArray(structured.riskNotes);
  const interaction = stringOf(structured.interactionEnding);

  const [titleOptionsOpen, setTitleOptionsOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  function patchStructured(patch: Record<string, unknown>) {
    props.onEdit({ structured: { ...structured, ...patch } });
  }

  function patchPage(index: number, patch: Record<string, unknown>) {
    patchStructured({
      pages: pages.map((page, pageIndex) =>
        pageIndex === index ? { ...page, ...patch } : page,
      ),
    });
  }

  function renumber(next: Array<Record<string, unknown>>) {
    return next.map((page, index) => ({ ...page, pageNumber: index + 1 }));
  }

  function addPage(afterIndex: number) {
    const next = [...pages];
    next.splice(afterIndex + 1, 0, {
      pageNumber: 0,
      heading: "",
      body: "",
      visualSuggestion: "",
    });
    patchStructured({ pages: renumber(next) });
  }

  function removePage(index: number) {
    patchStructured({ pages: renumber(pages.filter((_, pageIndex) => pageIndex !== index)) });
  }

  function movePage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[index], next[target]] = [next[target], next[index]];
    patchStructured({ pages: renumber(next) });
  }

  /** 换用备选标题:当前标题回到备选列表原位置,保持候选不丢。 */
  function swapTitle(option: string, optionIndex: number) {
    const current = props.draft.title.trim();
    const nextOptions = [...titleOptions];
    if (current) nextOptions[optionIndex] = current;
    else nextOptions.splice(optionIndex, 1);
    props.onEdit({
      title: option,
      structured: { ...structured, title: option, titleOptions: nextOptions },
    });
  }

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
        {titleOptions.length > 0 ? (
          <div className="mt-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-[#746F67] hover:bg-[#F0EDE6] hover:text-[#1F1D19]"
              aria-expanded={titleOptionsOpen}
              data-testid="artifact-title-options-toggle"
              onClick={() => setTitleOptionsOpen((open) => !open)}
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "h-3 w-3 transition-transform",
                  titleOptionsOpen ? "rotate-0" : "-rotate-90",
                )}
              />
              备选标题({titleOptions.length})
            </button>
            {titleOptionsOpen ? (
              <ul className="mt-1 space-y-1" data-testid="artifact-title-options">
                {titleOptions.map((option, index) => (
                  <li
                    key={`${option}-${index}`}
                    className="flex items-center gap-2 rounded-lg bg-[#FAF9F6] px-2 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">{option}</span>
                    {!props.readOnly ? (
                      <button
                        type="button"
                        className="shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] text-[#67625A] hover:bg-[#EDE9E0] hover:text-[#1F1D19]"
                        onClick={() => swapTitle(option, index)}
                      >
                        换用
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </EditorBlock>

      <EditorBlock
        anchor={artifactBlockAnchor("cover")}
        label="封面文案建议"
        hint="用于首图大字"
        onAskRefine={
          props.readOnly ? undefined : () => props.onAskRefine({ kind: "cover" })
        }
      >
        <StringListEditor
          items={coverOptions}
          readOnly={props.readOnly}
          onChange={(items) => patchStructured({ coverTextOptions: items })}
          itemLabel="封面文案"
          addLabel="添加封面文案"
          emptyText="该版本没有封面文案建议。"
          maxLength={24}
        />
      </EditorBlock>

      <EditorBlock
        anchor={artifactBlockAnchor("pages")}
        label={`分页(${pages.length} 页)`}
        actions={
          !props.readOnly && pages.length === 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-[#746F67] hover:bg-[#F0EDE6] hover:text-[#1F1D19]"
              onClick={() => addPage(-1)}
            >
              <Plus className="h-3 w-3" aria-hidden /> 添加第一页
            </button>
          ) : undefined
        }
      >
        {pages.length === 0 ? (
          <p className="text-xs text-[#9C968C]">该版本没有分页结构。</p>
        ) : (
          <div className="space-y-2.5">
            {pages.map((page, index) => (
              <PageEditor
                key={index}
                index={index}
                total={pages.length}
                page={page}
                readOnly={props.readOnly}
                onPatch={(patch) => patchPage(index, patch)}
                onMove={(direction) => movePage(index, direction)}
                onRemove={() => removePage(index)}
                onAdd={() => addPage(index)}
                onAskRefine={(excerpt) =>
                  props.onAskRefine(
                    { kind: "page", index },
                    { detail: stringOf(page.heading), excerpt },
                  )
                }
              />
            ))}
          </div>
        )}
      </EditorBlock>

      <EditorBlock
        anchor={artifactBlockAnchor("body")}
        label="完整正文"
        labelFor="artifact-body"
        hint="发布时粘贴的正文"
        onAskRefine={
          props.readOnly
            ? undefined
            : () =>
                props.onAskRefine(
                  { kind: "body" },
                  { excerpt: selectionOf(bodyRef.current) },
                )
        }
      >
        <Textarea
          id="artifact-body"
          ref={bodyRef}
          className="min-h-[200px] rounded-xl border-[#DDD7CE] bg-white text-sm leading-7"
          value={props.draft.body}
          disabled={props.readOnly}
          onChange={(event) => props.onEdit({ body: event.target.value })}
        />
        {!props.readOnly ? (
          <p className="mt-1 text-[11px] leading-4 text-[#9C968C]">
            选中一段文字后点「让星迹修改」,可只改这一段。
          </p>
        ) : null}
      </EditorBlock>

      <EditorBlock
        anchor={artifactBlockAnchor("interaction")}
        label="互动收尾"
        labelFor="artifact-interaction"
        onAskRefine={
          props.readOnly ? undefined : () => props.onAskRefine({ kind: "interaction" })
        }
      >
        <Textarea
          id="artifact-interaction"
          className="min-h-[56px] rounded-xl border-[#DDD7CE] bg-white text-sm leading-6"
          value={interaction}
          disabled={props.readOnly}
          placeholder="引导评论/收藏的收尾一句"
          onChange={(event) => patchStructured({ interactionEnding: event.target.value })}
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
    </div>
  );
}

/** 单页编辑:默认露出小标题与正文,视觉建议按需展开。 */
function PageEditor(props: {
  index: number;
  total: number;
  page: Record<string, unknown>;
  readOnly: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onAdd: () => void;
  onAskRefine: (excerpt: string) => void;
}) {
  const [visualOpen, setVisualOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const heading = stringOf(props.page.heading);
  const body = stringOf(props.page.body);
  const visual = stringOf(props.page.visualSuggestion);
  const pageLabel = `第 ${props.index + 1} 页`;

  return (
    <section
      data-artifact-block={artifactItemAnchor("pages", props.index)}
      data-testid={`artifact-page-${props.index + 1}`}
      className="rounded-xl border border-[#E7E5E0] bg-[#FFFDF9] p-2.5"
    >
      <div className="flex items-center gap-1.5">
        <span className="shrink-0 rounded bg-[#EDE9E0] px-1.5 py-0.5 font-mono text-[11px] text-[#67625A]">
          {pageLabel}
        </span>
        <Input
          value={heading}
          disabled={props.readOnly}
          maxLength={50}
          placeholder="本页小标题"
          aria-label={`${pageLabel}小标题`}
          className="h-7 flex-1 rounded-lg border-transparent bg-transparent px-1.5 text-sm font-medium focus-visible:border-[#DDD7CE] focus-visible:bg-white"
          onChange={(event) => props.onPatch({ heading: event.target.value })}
        />
        {!props.readOnly ? (
          <>
            <RefineButton
              label={`让星迹修改${pageLabel}`}
              onClick={() => props.onAskRefine(selectionOf(bodyRef.current))}
            />
            <button
              type="button"
              className="rounded-lg p-1 text-[#9C968C] hover:bg-[#F0EDE6] hover:text-[#1F1D19] disabled:opacity-30"
              aria-label={`${pageLabel}上移`}
              disabled={props.index === 0}
              onClick={() => props.onMove(-1)}
            >
              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className="rounded-lg p-1 text-[#9C968C] hover:bg-[#F0EDE6] hover:text-[#1F1D19] disabled:opacity-30"
              aria-label={`${pageLabel}下移`}
              disabled={props.index === props.total - 1}
              onClick={() => props.onMove(1)}
            >
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className="rounded-lg p-1 text-[#9C968C] hover:bg-[#F0EDE6] hover:text-[#8A2B24]"
              aria-label={`删除${pageLabel}`}
              onClick={props.onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      <Textarea
        ref={bodyRef}
        value={body}
        disabled={props.readOnly}
        aria-label={`${pageLabel}正文`}
        placeholder="本页正文"
        className="mt-1.5 min-h-[64px] rounded-lg border-[#EDE9E0] bg-white text-sm leading-6"
        onChange={(event) => props.onPatch({ body: event.target.value })}
      />

      <div className="mt-1 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <DisclosureRow
            label={visual ? "视觉建议" : "视觉建议(未填写)"}
            open={visualOpen}
            onToggle={() => setVisualOpen((open) => !open)}
          >
            <Textarea
              value={visual}
              disabled={props.readOnly}
              aria-label={`${pageLabel}视觉建议`}
              placeholder="这一页的画面/排版建议"
              className="min-h-[48px] rounded-lg border-[#EDE9E0] bg-[#FAF9F6] text-xs leading-5"
              onChange={(event) => props.onPatch({ visualSuggestion: event.target.value })}
            />
          </DisclosureRow>
        </div>
        {!props.readOnly ? (
          <button
            type="button"
            className="inline-flex shrink-0 items-center gap-1 self-start rounded-lg px-1.5 py-1 text-[11px] text-[#746F67] hover:bg-[#F0EDE6] hover:text-[#1F1D19]"
            onClick={props.onAdd}
          >
            <Plus className="h-3 w-3" aria-hidden /> 在此页后加页
          </button>
        ) : null}
      </div>
    </section>
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
