"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Link2,
  Plus,
  Puzzle,
  Send,
  Settings,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SkillCatalogItem } from "@/lib/skills/catalog";
import { Progress } from "@/components/ui/progress";

export type ComposerContextChip = {
  id: string;
  kind: "account" | "persona" | "idea" | "content" | "reference" | "patch";
  label: string;
  entityType?: "social_connection" | "persona" | "idea" | "content" | "benchmark_note";
};

type MentionItem = {
  kind: ComposerContextChip["kind"] | "skill";
  id: string;
  label: string;
  description?: string | null;
  entityType?: ComposerContextChip["entityType"];
};

const PLATFORM_LABEL = { xiaohongshu: "小红书", douyin: "抖音" } as const;

export function CreatorComposer(props: {
  platform: "xiaohongshu" | "douyin";
  value: string;
  busy: boolean;
  chips: ComposerContextChip[];
  skills: SkillCatalogItem[];
  selectedSkillIds: string[];
  onChange: (value: string) => void;
  onSend: () => void;
  onRemoveChip: (id: string) => void;
  onAddMention: (item: ComposerContextChip) => void;
  onSwitchPlatform: (platform: "xiaohongshu" | "douyin") => void;
  showPlatformSwitcher?: boolean;
  /** 从技能菜单选择内置 Skill(star-skill/v1 manifest 驱动) */
  onPickSkill?: (skill: SkillCatalogItem) => void;
  onToggleSkill: (skillId: string) => void;
  contextUsage?: { ratio: number; tokens: number; contextWindow: number; checkpointCount: number } | null;
}) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [platformOpen, setPlatformOpen] = useState(false);
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const mentionMatch = props.value.match(/(?:^|\s)([@$])([^\s@$]*)$/);
  const mentionPrefix = mentionMatch?.[1] ?? null;
  const mentionQuery = mentionMatch?.[2] ?? null;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const plusButtonRef = useRef<HTMLButtonElement | null>(null);
  const generationSkills = useMemo(
    () =>
      props.skills.filter(
        (skill) => skill.enabled && skill.scopes.includes("generation"),
      ),
    [props.skills],
  );
  const patchSkills = useMemo(
    () =>
      props.skills.filter(
        (skill) =>
          skill.enabled && skill.scopes.includes("patch") && skill.composerTemplate,
      ),
    [props.skills],
  );
  const selectedSkills = useMemo(
    () =>
      props.selectedSkillIds.flatMap((id) => {
        const skill = props.skills.find((item) => item.id === id);
        return skill ? [skill] : [];
      }),
    [props.selectedSkillIds, props.skills],
  );

  // 自适应高度,约 8 行后内部滚动
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 208)}px`;
  }, [props.value]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPlusOpen(false);
        setSkillsOpen(false);
        setPlatformOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!mentionPrefix || mentionQuery === null) {
      setMentionItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ prefix: mentionPrefix, q: mentionQuery });
      fetch(`/api/mentions?${params}`, { signal: controller.signal, cache: "no-store" })
        .then((response) => response.ok ? response.json() : { items: [] })
        .then((data: { items?: MentionItem[] }) => setMentionItems(data.items ?? []))
        .catch(() => undefined);
    }, 120);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [mentionPrefix, mentionQuery]);

  // Esc 只关闭菜单并把焦点还给触发按钮,不影响外层(如 Artifact 面板)
  useEffect(() => {
    if (!plusOpen && !platformOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setPlusOpen(false);
      setSkillsOpen(false);
      setPlatformOpen(false);
      plusButtonRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [plusOpen, platformOpen]);

  const canSend = props.value.trim().length > 0 && !props.busy;

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-4xl">
      {props.chips.length > 0 || selectedSkills.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5" data-testid="composer-chips">
          {props.chips.map((chip) => (
            <span
              key={chip.id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border bg-card py-1 pl-2.5 pr-1 text-xs text-foreground"
            >
              <span className="truncate">
                {chip.kind === "idea" ? "选题：" : chip.kind === "patch" ? "修改：" : chip.kind === "account" ? "账号：" : chip.kind === "persona" ? "人设：" : chip.kind === "reference" ? "参考：" : "作品："}
                {chip.label}
              </span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => props.onRemoveChip(chip.id)}
                aria-label={`移除上下文 ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {selectedSkills.map((skill) => (
            <span
              key={skill.id}
              className="inline-flex max-w-full items-center gap-1 rounded-md border bg-card py-1 pl-2.5 pr-1 text-xs text-foreground"
              data-testid={`selected-skill-${skill.id}`}
            >
              <span className="truncate">Skill：{skill.name}</span>
              <button
                type="button"
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => props.onToggleSkill(skill.id)}
                aria-label={`移除 Skill：${skill.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative overflow-visible rounded-[18px] border border-foreground/25 bg-card shadow-float transition-[border-color] duration-short focus-within:border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
        {mentionMatch && mentionItems.length ? (
          <div className="absolute inset-x-0 bottom-full mb-2 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md" role="listbox" aria-label="引用建议">
            {mentionItems.map((item) => (
              <button
                key={`${item.kind}:${item.id}`}
                type="button"
                className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-accent"
                onClick={() => {
                  props.onChange(props.value.replace(/(?:^|\s)([@$])([^\s@$]*)$/, "").trimEnd());
                  if (item.kind === "skill") props.onToggleSkill(item.id);
                  else if (item.entityType) props.onAddMention({ id: item.id, kind: item.kind, label: item.label, entityType: item.entityType });
                  setMentionItems([]);
                  textareaRef.current?.focus();
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{mentionMatch[1]}{item.label}</span>
                  {item.description ? <span className="block truncate text-xs text-muted-foreground">{item.description}</span> : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSend) props.onSend();
            }
          }}
          rows={1}
          placeholder="告诉星迹你想创作什么…"
          aria-label="创作输入框"
          className="block min-h-[66px] w-full resize-none bg-transparent px-4 py-4 text-[15px] leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0 sm:px-5"
        />

        <div className="relative flex min-h-12 items-center gap-1 border-t px-2 py-1.5 sm:px-3">
          {/* + 菜单:技能来自内置 Skill Registry;未实现能力明确标注,不假装成功 */}
          {props.showPlatformSwitcher !== false ? <div className="relative">
            <Button
              ref={plusButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="添加资料或技能"
              aria-expanded={plusOpen}
              onClick={() => {
                setPlusOpen((open) => !open);
                setSkillsOpen(false);
                setPlatformOpen(false);
              }}
            >
              <Plus className="h-5 w-5" />
            </Button>
            {plusOpen ? (
              <div
                className="absolute bottom-11 left-0 z-20 w-64 rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-1.5 shadow-[0_8px_24px_rgba(31,29,25,0.12)]"
                data-testid="composer-plus-menu"
              >
                {[
                  { icon: Upload, label: "上传素材" },
                  { icon: Link2, label: "导入链接" },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    disabled
                    className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[#746F67] opacity-70"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                    <span className="ml-auto rounded bg-[#EDE9E0] px-1.5 py-0.5 text-[10px]">
                      即将支持
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[#1F1D19] hover:bg-[#EDE9E0]"
                  aria-expanded={skillsOpen}
                  data-testid="composer-skills-toggle"
                  onClick={() => setSkillsOpen((open) => !open)}
                >
                  <Puzzle className="h-4 w-4" />
                  技能
                  <ChevronDown
                    className={cn(
                      "ml-auto h-3.5 w-3.5 text-[#746F67] transition-transform",
                      skillsOpen ? "rotate-0" : "-rotate-90",
                    )}
                    aria-hidden
                  />
                </button>
                {skillsOpen ? (
                  <div
                    className="mt-1 max-h-64 space-y-0.5 overflow-y-auto border-t border-[#EDE9E0] pt-1"
                    data-testid="composer-skill-list"
                  >
                    <p className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-[#746F67]">
                      本次创作使用（可多选）
                    </p>
                    {generationSkills.map((skill) => {
                      const selected = props.selectedSkillIds.includes(skill.id);
                      return (
                        <button
                          key={`generation-${skill.id}`}
                          type="button"
                          className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-[#EDE9E0]"
                          aria-pressed={selected}
                          data-testid={`composer-creation-skill-${skill.id}`}
                          onClick={() => props.onToggleSkill(skill.id)}
                        >
                          <span
                            className={cn(
                              "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                              selected
                                ? "border-[#66806D] bg-[#66806D] text-white"
                                : "border-[#C9C2B8]",
                            )}
                          >
                            {selected ? <Check className="size-3" /> : null}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm text-[#1F1D19]">{skill.name}</span>
                            <span className="mt-0.5 block text-[11px] leading-4 text-[#746F67]">
                              {skill.description}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {!generationSkills.length ? (
                      <p className="px-2.5 py-2 text-xs text-[#746F67]">
                        没有已启用的创作 Skill。
                      </p>
                    ) : null}

                    <div className="my-1 border-t border-[#EDE9E0]" />
                    <p className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-[#746F67]">
                      修改选中区块
                    </p>
                    {patchSkills.map((skill) => (
                      <button
                        key={skill.id}
                        type="button"
                        className="w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-[#EDE9E0]"
                        data-testid={`composer-skill-${skill.id}`}
                        onClick={() => {
                          setPlusOpen(false);
                          setSkillsOpen(false);
                          props.onPickSkill?.(skill);
                        }}
                      >
                        <span className="block text-sm text-[#1F1D19]">{skill.name}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-[#746F67]">
                          {skill.description}
                        </span>
                      </button>
                    ))}
                    <Link
                      href="/settings/skills"
                      className="mt-1 flex items-center gap-2 border-t border-[#EDE9E0] px-2.5 py-2 text-xs text-[#746F67] hover:text-[#1F1D19]"
                    >
                      <Settings className="size-3.5" /> 管理 Skill
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div> : null}

          {/* 平台切换:上下文状态,不是两套布局 */}
          <div className="relative">
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                platformOpen
                  ? "bg-muted text-foreground"
                  : "text-foreground hover:bg-muted",
              )}
              aria-expanded={platformOpen}
              aria-label="选择平台"
              data-testid="platform-switcher"
              onClick={() => {
                setPlatformOpen((open) => !open);
                setPlusOpen(false);
              }}
            >
              {PLATFORM_LABEL[props.platform]}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </button>
            {platformOpen ? (
              <div className="absolute bottom-11 left-0 z-20 w-40 rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-1.5 shadow-[0_8px_24px_rgba(31,29,25,0.12)]">
                {(Object.keys(PLATFORM_LABEL) as Array<"xiaohongshu" | "douyin">).map(
                  (platform) => (
                    <button
                      key={platform}
                      type="button"
                      className={cn(
                        "flex w-full items-center rounded-lg px-2.5 py-2 text-left text-sm hover:bg-[#EDF1EC]",
                        platform === props.platform && "bg-[#EDF4EE] font-medium text-[#476451]",
                      )}
                      onClick={() => {
                        setPlatformOpen(false);
                        if (platform !== props.platform) props.onSwitchPlatform(platform);
                      }}
                    >
                      {PLATFORM_LABEL[platform]}
                      {platform === "xiaohongshu" ? "图文" : "脚本"}
                      {platform === props.platform ? <Check className="ml-auto h-4 w-4" /> : null}
                    </button>
                  ),
                )}
              </div>
            ) : null}
          </div>

          <Button
            type="button"
            size="icon"
            className="ml-auto rounded-md shadow-none"
            disabled={!canSend}
            onClick={props.onSend}
            aria-label="发送"
          >
            <Send />
          </Button>
        </div>
      </div>

      <p className="mt-1.5 hidden text-center text-[11px] text-[#67625A] sm:block">
        Enter 发送,Shift+Enter 换行
      </p>
      {props.contextUsage ? (
        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground" title="模型上下文占用">
          <Progress className="h-1 flex-1" value={Math.round(props.contextUsage.ratio * 100)} />
          <span>{Math.round(props.contextUsage.ratio * 100)}%{props.contextUsage.checkpointCount ? ` · ${props.contextUsage.checkpointCount} 个检查点` : ""}</span>
        </div>
      ) : null}
    </div>
  );
}
