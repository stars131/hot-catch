"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  artifactBlockAnchor,
  type ArtifactSectionRef,
} from "@/lib/creator/artifact-locator";
import type { ArtifactContentData, ArtifactDraft } from "@/hooks/creator/use-artifact";
import { XhsGraphicEditor } from "@/components/creator/artifact/xhs-graphic-editor";
import { DouyinStoryboardEditor } from "@/components/creator/artifact/douyin-storyboard-editor";

/**
 * 「内容」标签:按平台分发到结构化编辑器。
 * 小红书 → 阅读顺序渐进编辑;抖音 → 分镜时间轴。
 * 没有结构化数据的版本(旧数据/纯手写稿)退化为标题 + 正文。
 * 编辑实时进入草稿并自动保存为 manual 版本;只读预览时全部禁用。
 */
export function ArtifactContentTab(props: {
  content: ArtifactContentData;
  draft: ArtifactDraft;
  readOnly: boolean;
  onEdit: (patch: Partial<ArtifactDraft>) => void;
  onAskRefine: (
    section: ArtifactSectionRef,
    options?: { detail?: string; excerpt?: string },
  ) => void;
}) {
  if (
    !props.draft.structured ||
    !["xhs_graphic", "douyin_video_script"].includes(props.content.contentKind)
  ) {
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
            disabled={props.readOnly}
            onChange={(event) => props.onEdit({ title: event.target.value })}
          />
        </div>
        <div data-artifact-block={artifactBlockAnchor("body")} className="rounded-xl">
          <label htmlFor="artifact-body" className="text-xs font-medium text-[#67625A]">
            {props.content.contentKind === "xhs_graphic" ? "完整正文" : "内容正文"}
          </label>
          <Textarea
            id="artifact-body"
            className="mt-1.5 min-h-[260px] rounded-xl border-[#DDD7CE] bg-white text-sm leading-7"
            value={props.draft.body}
            disabled={props.readOnly}
            onChange={(event) => props.onEdit({ body: event.target.value })}
          />
        </div>
        <p className="text-xs leading-5 text-[#9C968C]">
          {props.content.contentKind === "xhs_graphic" || props.content.contentKind === "douyin_video_script"
            ? "该版本没有结构化数据，只能编辑标题与正文；在对话中让星迹重新生成可获得分页/分镜结构。"
            : "海外平台内容包使用通用正文编辑器；平台结构仍保存在版本数据中，导出包会继续包含 JSON。"}
        </p>
      </div>
    );
  }

  return props.content.contentKind === "xhs_graphic" ? (
    <XhsGraphicEditor
      draft={props.draft}
      readOnly={props.readOnly}
      onEdit={props.onEdit}
      onAskRefine={props.onAskRefine}
    />
  ) : (
    <DouyinStoryboardEditor
      draft={props.draft}
      readOnly={props.readOnly}
      onEdit={props.onEdit}
      onAskRefine={props.onAskRefine}
    />
  );
}
