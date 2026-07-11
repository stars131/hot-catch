"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Plus, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * 结构化编辑器的共享积木:块容器、「让星迹修改」入口、标签与列表编辑。
 * 视觉保持克制:小标签 + 紧凑控件,不做卡片套卡片。
 */

/** 内容块容器:锚点 + 标题行 + 可选「让星迹修改」入口。 */
export function EditorBlock(props: {
  anchor: string;
  label: string;
  labelFor?: string;
  hint?: string;
  actions?: ReactNode;
  onAskRefine?: () => void;
  refineLabel?: string;
  children: ReactNode;
}) {
  return (
    <section data-artifact-block={props.anchor} className="rounded-xl">
      <div className="flex min-h-7 items-center gap-2">
        {props.labelFor ? (
          <label htmlFor={props.labelFor} className="text-xs font-medium text-[#67625A]">
            {props.label}
          </label>
        ) : (
          <p className="text-xs font-medium text-[#67625A]">{props.label}</p>
        )}
        {props.hint ? (
          <span className="text-[11px] text-[#9C968C]">{props.hint}</span>
        ) : null}
        <span className="min-w-0 flex-1" />
        {props.actions}
        {props.onAskRefine ? (
          <RefineButton
            label={props.refineLabel ?? `让星迹修改${props.label}`}
            onClick={props.onAskRefine}
          />
        ) : null}
      </div>
      <div className="mt-1">{props.children}</div>
    </section>
  );
}

/** 「让星迹修改」按钮:把区块引用交回对话,由用户补全修改诉求。 */
export function RefineButton(props: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-[#8A6414] hover:bg-[#F5EEDC] hover:text-[#6B4E0F]",
        props.className,
      )}
      aria-label={props.label}
      title={props.label}
      onClick={props.onClick}
      data-testid="artifact-refine-trigger"
    >
      <Sparkles className="h-3 w-3" aria-hidden />
      让星迹修改
    </button>
  );
}

/** 折叠提示区:视觉建议、高级项等按需展开的次要字段。 */
export function DisclosureRow(props: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] text-[#746F67] hover:bg-[#F0EDE6] hover:text-[#1F1D19]"
        aria-expanded={props.open}
        onClick={props.onToggle}
      >
        <span
          aria-hidden
          className={cn(
            "text-[10px] transition-transform",
            props.open ? "rotate-90" : "rotate-0",
          )}
        >
          ▸
        </span>
        {props.label}
      </button>
      {props.open ? <div className="mt-1 space-y-2">{props.children}</div> : null}
    </div>
  );
}

/** 标签编辑:Chip + 删除 + 回车添加;只读时仅展示。 */
export function TagChipsEditor(props: {
  tags: string[];
  readOnly: boolean;
  onChange: (tags: string[]) => void;
}) {
  const [pending, setPending] = useState("");
  const inputId = useId();

  function commit() {
    const value = pending.trim().replace(/^#/, "");
    if (!value) return;
    setPending("");
    if (props.tags.includes(value)) return;
    props.onChange([...props.tags, value]);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {props.tags.map((tag, index) => (
        <span
          key={`${tag}-${index}`}
          className="inline-flex items-center gap-1 rounded-lg bg-[#EDE9E0] py-0.5 pl-1.5 pr-1 text-xs text-[#67625A]"
        >
          #{tag}
          {!props.readOnly ? (
            <button
              type="button"
              className="rounded p-0.5 hover:bg-[#DDD7CE] hover:text-[#1F1D19]"
              aria-label={`删除标签 ${tag}`}
              onClick={() =>
                props.onChange(props.tags.filter((_, tagIndex) => tagIndex !== index))
              }
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          ) : null}
        </span>
      ))}
      {props.tags.length === 0 && props.readOnly ? (
        <span className="text-xs text-[#9C968C]">暂无标签。</span>
      ) : null}
      {!props.readOnly ? (
        <Input
          id={inputId}
          value={pending}
          onChange={(event) => setPending(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder="添加标签,回车确认"
          aria-label="添加标签"
          className="h-7 w-36 rounded-lg border-[#DDD7CE] bg-white text-xs"
          maxLength={30}
        />
      ) : null}
    </div>
  );
}

/** 短文本列表编辑(封面文案、风险说明):行内编辑 + 显式增删。 */
export function StringListEditor(props: {
  items: string[];
  readOnly: boolean;
  onChange: (items: string[]) => void;
  itemLabel: string;
  addLabel: string;
  emptyText: string;
  maxLength?: number;
}) {
  if (props.items.length === 0 && props.readOnly) {
    return <p className="text-xs text-[#9C968C]">{props.emptyText}</p>;
  }
  return (
    <div className="space-y-1.5">
      {props.items.map((item, index) => (
        <div key={index} className="flex items-center gap-1.5">
          <Input
            value={item}
            readOnly={props.readOnly}
            disabled={props.readOnly}
            maxLength={props.maxLength ?? 500}
            aria-label={`${props.itemLabel} ${index + 1}`}
            className="h-8 rounded-lg border-[#DDD7CE] bg-white text-sm"
            onChange={(event) =>
              props.onChange(
                props.items.map((existing, itemIndex) =>
                  itemIndex === index ? event.target.value : existing,
                ),
              )
            }
          />
          {!props.readOnly ? (
            <button
              type="button"
              className="shrink-0 rounded-lg p-1.5 text-[#9C968C] hover:bg-[#F0EDE6] hover:text-[#8A2B24]"
              aria-label={`删除${props.itemLabel} ${index + 1}`}
              onClick={() =>
                props.onChange(props.items.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      ))}
      {!props.readOnly ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-[#746F67] hover:bg-[#F0EDE6] hover:text-[#1F1D19]"
          onClick={() => props.onChange([...props.items, ""])}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          {props.addLabel}
        </button>
      ) : null}
    </div>
  );
}

/** 视口是否小于给定宽度;SSR 与首帧返回 false,挂载后跟随媒体查询。 */
export function useViewportBelow(px: number): boolean {
  const [below, setBelow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${px - 1}px)`);
    const update = () => setBelow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [px]);
  return below;
}

/** 从 textarea 中读取当前选中文本(用于「让星迹修改」携带摘录)。 */
export function selectionOf(element: HTMLTextAreaElement | null): string {
  if (!element) return "";
  const { selectionStart, selectionEnd, value } = element;
  if (selectionStart === selectionEnd) return "";
  return value.slice(selectionStart, selectionEnd);
}
