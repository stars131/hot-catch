"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ArtifactDraft } from "@/hooks/creator/use-artifact";
import type { ContentKindId } from "@/lib/platforms/registry";

type ScalarField = {
  key: string;
  label: string;
  kind?: "input" | "textarea" | "number";
  body?: boolean;
  hint?: string;
};

type ListField = {
  key: string;
  label: string;
  itemLabel: string;
  fields: ScalarField[];
};

type EditorConfig = {
  intro: string;
  fields: ScalarField[];
  stringLists?: Array<{ key: string; label: string; placeholder: string }>;
  lists?: ListField[];
};

const CONFIG: Partial<Record<ContentKindId, EditorConfig>> = {
  youtube_video_package: {
    intro: "按 YouTube 的包装、开场、章节与简介顺序编辑。修改会进入同一套版本历史。",
    fields: [
      { key: "thumbnailText", label: "缩略图文案", hint: "保持短、准，并与视频内容一致" },
      { key: "hook", label: "前 30 秒钩子", kind: "textarea" },
      { key: "durationSec", label: "预计时长（秒）", kind: "number" },
      { key: "description", label: "视频简介", kind: "textarea", body: true },
      { key: "callToAction", label: "行动引导", kind: "textarea" },
    ],
    stringLists: [{ key: "tags", label: "标签", placeholder: "输入标签" }],
    lists: [
      {
        key: "sections",
        label: "脚本段落",
        itemLabel: "段落",
        fields: [
          { key: "heading", label: "段落标题" },
          { key: "narration", label: "口播/旁白", kind: "textarea" },
          { key: "visualDirection", label: "画面指导", kind: "textarea" },
        ],
      },
      {
        key: "chapters",
        label: "章节",
        itemLabel: "章节",
        fields: [
          { key: "timeSec", label: "时间（秒）", kind: "number" },
          { key: "title", label: "章节名" },
        ],
      },
    ],
  },
  tiktok_short_video_script: {
    intro: "按 TikTok 的竖屏短视频结构编辑钩子、镜头、Caption 与披露信息。",
    fields: [
      { key: "hook", label: "开场钩子", kind: "textarea" },
      { key: "durationSec", label: "预计时长（秒）", kind: "number" },
      { key: "caption", label: "Caption", kind: "textarea", body: true },
      { key: "musicDirection", label: "音乐方向", kind: "textarea" },
      { key: "callToAction", label: "行动引导", kind: "textarea" },
    ],
    stringLists: [
      { key: "hashtags", label: "Hashtags", placeholder: "输入 Hashtag" },
      { key: "disclosureNotes", label: "披露说明", placeholder: "输入披露说明" },
    ],
    lists: [{
      key: "shots",
      label: "分镜",
      itemLabel: "镜头",
      fields: [
        { key: "voiceover", label: "口播", kind: "textarea" },
        { key: "visual", label: "画面", kind: "textarea" },
        { key: "onScreenText", label: "屏幕文字" },
        { key: "camera", label: "机位/运动" },
        { key: "transition", label: "转场" },
      ],
    }],
  },
  instagram_carousel: {
    intro: "按 Instagram Carousel 的封面、逐页叙事、可访问性文本与 Caption 编辑。",
    fields: [
      { key: "coverText", label: "封面文案" },
      { key: "caption", label: "Caption", kind: "textarea", body: true },
      { key: "callToAction", label: "行动引导", kind: "textarea" },
    ],
    stringLists: [{ key: "hashtags", label: "Hashtags", placeholder: "输入 Hashtag" }],
    lists: [{
      key: "slides",
      label: "轮播页",
      itemLabel: "页面",
      fields: [
        { key: "heading", label: "页标题" },
        { key: "body", label: "页正文", kind: "textarea" },
        { key: "visualDirection", label: "视觉指导", kind: "textarea" },
        { key: "altText", label: "Alt Text", kind: "textarea", hint: "描述画面信息，便于无障碍阅读" },
      ],
    }],
  },
  x_thread: {
    intro: "逐条编辑 X 线程。发布前请确认每条内容不超过 280 个字符。",
    fields: [{ key: "callToAction", label: "结尾行动引导", kind: "textarea" }],
    lists: [{
      key: "posts",
      label: "线程内容",
      itemLabel: "帖子",
      fields: [
        { key: "text", label: "正文", kind: "textarea", hint: "建议不超过 280 个字符" },
        { key: "mediaSuggestion", label: "媒体建议", kind: "textarea" },
      ],
    }],
  },
  reddit_post: {
    intro: "按目标社区、正文、TL;DR、讨论问题和披露信息编辑；发布前仍需人工核对社区规则。",
    fields: [
      { key: "audience", label: "目标读者" },
      { key: "bodyMarkdown", label: "帖子正文（Markdown）", kind: "textarea", body: true },
      { key: "tldr", label: "TL;DR", kind: "textarea" },
      { key: "discussionPrompt", label: "讨论问题", kind: "textarea" },
      { key: "flairSuggestion", label: "Flair 建议" },
      { key: "disclosure", label: "披露说明", kind: "textarea" },
    ],
    stringLists: [{ key: "subredditSuggestions", label: "社区建议", placeholder: "输入社区名" }],
  },
};

export function GlobalPlatformEditor(props: {
  contentKind: ContentKindId;
  draft: ArtifactDraft;
  readOnly: boolean;
  onEdit: (patch: Partial<ArtifactDraft>) => void;
}) {
  const config = CONFIG[props.contentKind];
  const structured = props.draft.structured;
  if (!config || !structured) return null;

  function patchStructured(patch: Record<string, unknown>, body?: string) {
    props.onEdit({
      structured: { ...structured!, ...patch },
      ...(body === undefined ? {} : { body }),
    });
  }

  function setScalar(field: ScalarField, raw: string) {
    const value = field.kind === "number" ? Number(raw) || 0 : raw;
    patchStructured({ [field.key]: value }, field.body ? raw : undefined);
  }

  function updateList(list: ListField, index: number, field: ScalarField, raw: string) {
    const current = recordArray(structured![list.key]);
    const value = field.kind === "number" ? Number(raw) || 0 : raw;
    const next = current.map((item, itemIndex) =>
      itemIndex === index ? { ...item, [field.key]: value } : item,
    );
    patchStructured({ [list.key]: next });
  }

  return (
    <div className="space-y-6 px-4 py-5">
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="global-editor-title">标题</FieldLabel>
          <Input
            id="global-editor-title"
            value={props.draft.title}
            disabled={props.readOnly}
            onChange={(event) => props.onEdit({
              title: event.target.value,
              structured: { ...structured, title: event.target.value },
            })}
          />
          <FieldDescription>{config.intro}</FieldDescription>
        </Field>

        {config.fields.map((field) => (
          <ScalarEditor
            key={field.key}
            field={field}
            value={structured[field.key]}
            disabled={props.readOnly}
            onChange={(value) => setScalar(field, value)}
          />
        ))}
      </FieldGroup>

      {config.stringLists?.map((list) => {
        const values = stringArray(structured[list.key]);
        return (
          <section key={list.key} className="space-y-3 border-t pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">{list.label}</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={props.readOnly}
                onClick={() => patchStructured({ [list.key]: [...values, ""] })}
              >
                <Plus data-icon="inline-start" />添加
              </Button>
            </div>
            <div className="space-y-2">
              {values.map((value, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={`${list.label} ${index + 1}`}
                    placeholder={list.placeholder}
                    value={value}
                    disabled={props.readOnly}
                    onChange={(event) => patchStructured({
                      [list.key]: values.map((item, itemIndex) => itemIndex === index ? event.target.value : item),
                    })}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`删除${list.label} ${index + 1}`}
                    disabled={props.readOnly}
                    onClick={() => patchStructured({ [list.key]: values.filter((_, itemIndex) => itemIndex !== index) })}
                  >
                    <Trash2 data-icon="icon" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {config.lists?.map((list) => {
        const items = recordArray(structured[list.key]);
        return (
          <section key={list.key} className="space-y-3 border-t pt-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">{list.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">共 {items.length} 个{list.itemLabel}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={props.readOnly}
                onClick={() => patchStructured({
                  [list.key]: [...items, Object.fromEntries(list.fields.map((field) => [field.key, field.kind === "number" ? 0 : ""]))],
                })}
              >
                <Plus data-icon="inline-start" />添加{list.itemLabel}
              </Button>
            </div>
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="rounded-xl border bg-card p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-muted-foreground">{list.itemLabel} {index + 1}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`删除${list.itemLabel} ${index + 1}`}
                      disabled={props.readOnly}
                      onClick={() => patchStructured({ [list.key]: items.filter((_, itemIndex) => itemIndex !== index) })}
                    >
                      <Trash2 data-icon="icon" />
                    </Button>
                  </div>
                  <FieldGroup className="gap-4">
                    {list.fields.map((field) => (
                      <ScalarEditor
                        key={field.key}
                        idPrefix={`${list.key}-${index}`}
                        field={field}
                        value={item[field.key]}
                        disabled={props.readOnly}
                        onChange={(value) => updateList(list, index, field, value)}
                      />
                    ))}
                  </FieldGroup>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ScalarEditor(props: {
  idPrefix?: string;
  field: ScalarField;
  value: unknown;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `global-editor-${props.idPrefix ? `${props.idPrefix}-` : ""}${props.field.key}`;
  const value = typeof props.value === "number" || typeof props.value === "string"
    ? String(props.value)
    : "";
  return (
    <Field>
      <FieldLabel htmlFor={id}>{props.field.label}</FieldLabel>
      {props.field.kind === "textarea" ? (
        <Textarea
          id={id}
          className="min-h-28 leading-6"
          value={value}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={props.field.kind === "number" ? "number" : "text"}
          value={value}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
        />
      )}
      {props.field.hint ? <FieldDescription>{props.field.hint}</FieldDescription> : null}
    </Field>
  );
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item) => item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {})
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
