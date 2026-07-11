"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { artifactBlockAnchor } from "@/lib/creator/artifact-locator";
import type { ArtifactContentData, ArtifactDraft } from "@/hooks/creator/use-artifact";

/**
 * 「内容」标签:标题与正文可直接编辑(自动保存为 manual 版本);
 * 互动/标签/风险为只读展示,结构字段的精细编辑在 C6 编辑器开放。
 */
export function ArtifactContentTab(props: {
  content: ArtifactContentData;
  draft: ArtifactDraft;
  structuredContent: unknown;
  onEdit: (patch: Partial<ArtifactDraft>) => void;
}) {
  const isXhs = props.content.contentKind === "xhs_graphic";
  const structured = asRecord(props.structuredContent);
  const interaction =
    typeof structured?.interactionEnding === "string"
      ? structured.interactionEnding
      : props.content.interactionEnding;
  const tags = Array.isArray(structured?.tags)
    ? (structured?.tags as unknown[]).filter(
        (tag): tag is string => typeof tag === "string",
      )
    : props.content.tags;
  const riskNotes = Array.isArray(structured?.riskNotes)
    ? (structured?.riskNotes as unknown[]).filter(
        (note): note is string => typeof note === "string",
      )
    : (props.content.riskNotes ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

  return (
    <div className="space-y-4 px-3.5 py-4">
      <div data-artifact-block={artifactBlockAnchor("title")} className="rounded-xl">
        <label htmlFor="artifact-title" className="text-xs font-medium text-[#67625A]">
          标题
        </label>
        <Input
          id="artifact-title"
          className="mt-1.5 rounded-xl border-[#DDD7CE] bg-white text-sm"
          value={props.draft.title}
          maxLength={200}
          onChange={(event) => props.onEdit({ title: event.target.value })}
        />
      </div>

      <div data-artifact-block={artifactBlockAnchor("body")} className="rounded-xl">
        <label htmlFor="artifact-body" className="text-xs font-medium text-[#67625A]">
          {isXhs ? "完整正文" : "发布文案"}
        </label>
        <Textarea
          id="artifact-body"
          className="mt-1.5 min-h-[260px] rounded-xl border-[#DDD7CE] bg-white text-sm leading-7"
          value={props.draft.body}
          onChange={(event) => props.onEdit({ body: event.target.value })}
        />
      </div>

      <div
        data-artifact-block={artifactBlockAnchor("interaction")}
        className="rounded-xl border border-[#E7E5E0] bg-[#FAF9F6] p-3"
      >
        <p className="text-xs font-medium text-[#67625A]">
          {isXhs ? "互动收尾与标签" : "标签"}
        </p>
        {isXhs && interaction ? (
          <p className="mt-1.5 text-sm leading-6">{interaction}</p>
        ) : null}
        {tags.length > 0 ? (
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-lg bg-[#EDE9E0] px-1.5 py-0.5 text-xs text-[#67625A]"
              >
                #{tag}
              </span>
            ))}
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-[#9C968C]">暂无标签。</p>
        )}
      </div>

      <div
        data-artifact-block={artifactBlockAnchor("risk")}
        className="rounded-xl border border-[#E7E5E0] bg-[#FAF9F6] p-3"
      >
        <p className="text-xs font-medium text-[#67625A]">风险说明</p>
        {riskNotes.length > 0 ? (
          <ul className="mt-1.5 space-y-1 text-sm leading-6">
            {riskNotes.map((note) => (
              <li key={note}>· {note}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-[#9C968C]">该版本没有记录风险说明。</p>
        )}
      </div>

      <p className="text-xs leading-5 text-[#9C968C]">
        分页、分镜等结构字段的精细编辑将在下一批次开放;当前可以在左侧对话中直接让星迹修改。
      </p>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
