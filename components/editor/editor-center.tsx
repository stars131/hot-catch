"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleDashed,
  FilePenLine,
  Loader2,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ArtifactPanel, type ArtifactRefineRequest } from "@/components/creator/artifact/artifact-panel";
import { PlatformPreview } from "@/components/editor/platform-preview";
import { PublishSettingsPanel } from "@/components/editor/publish-settings-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ArtifactContentData, ArtifactDraft } from "@/hooks/creator/use-artifact";
import { readApiJson } from "@/lib/api-client";
import {
  isPlatformId,
  PLATFORM_DEFINITIONS,
  PLATFORM_IDS,
  type ContentKindId,
  type PlatformId,
} from "@/lib/platforms/registry";
import { cn } from "@/lib/utils";

type ContentSummary = {
  id: string;
  title: string | null;
  status: "draft" | "saved" | "abandoned" | "published";
  outputType: string;
  platform: PlatformId;
  contentKind: ContentKindId;
  scoreSnapshot: unknown;
  _count: { revisions: number; publishRecords: number };
  createdAt: string;
  updatedAt: string;
};

type PreviewSnapshot = {
  content: ArtifactContentData;
  draft: ArtifactDraft;
  previewing: boolean;
};

const EMPTY_CONTENTS: ContentSummary[] = [];
const NOOP = () => undefined;

export function EditorCenter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryPlatform = searchParams.get("platform");
  const [platform, setPlatform] = useState<PlatformId>(isPlatformId(queryPlatform) ? queryPlatform : "xiaohongshu");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("contentId"));
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [rightTab, setRightTab] = useState<"preview" | "settings">("preview");
  const [preview, setPreview] = useState<PreviewSnapshot | null>(null);

  const contentsQuery = useQuery({
    queryKey: ["workspace", "contents"],
    queryFn: async () => readApiJson<{ contents: ContentSummary[] }>(
      await fetch("/api/content/list", { cache: "no-store" }),
    ),
    staleTime: 30_000,
    refetchInterval: (queryState) =>
      queryState.state.data?.contents.some((content) => content._count.revisions === 0) ? 5_000 : false,
  });
  const contents = contentsQuery.data?.contents ?? EMPTY_CONTENTS;

  const platformCounts = useMemo(() => Object.fromEntries(
    PLATFORM_IDS.map((id) => [id, contents.filter((content) => content.platform === id).length]),
  ) as Record<PlatformId, number>, [contents]);

  const visible = useMemo(() => contents.filter((content) => {
    if (content.platform !== platform) return false;
    if (!deferredQuery) return true;
    return `${content.title ?? ""} ${content.outputType}`.toLowerCase().includes(deferredQuery);
  }), [contents, deferredQuery, platform]);

  const selected = contents.find((content) => content.id === selectedId) ?? null;

  const updateLocation = useCallback((nextPlatform: PlatformId, nextContentId: string | null) => {
    const params = new URLSearchParams();
    params.set("platform", nextPlatform);
    if (nextContentId) params.set("contentId", nextContentId);
    router.replace(`/editor?${params.toString()}`, { scroll: false });
  }, [router]);

  useEffect(() => {
    if (contentsQuery.isPending || contents.length === 0) return;
    const fromUrl = selectedId ? contents.find((content) => content.id === selectedId) : null;
    if (fromUrl) {
      if (fromUrl.platform !== platform) {
        setPlatform(fromUrl.platform);
        updateLocation(fromUrl.platform, fromUrl.id);
      }
      return;
    }
    const next = contents.find((content) => content.platform === platform) ?? contents[0];
    setPlatform(next.platform);
    setSelectedId(next.id);
    updateLocation(next.platform, next.id);
  }, [contents, contentsQuery.isPending, platform, selectedId, updateLocation]);

  useEffect(() => {
    setPreview(null);
  }, [selectedId]);

  function choosePlatform(next: PlatformId) {
    const nextContent = contents.find((content) => content.platform === next) ?? null;
    setPlatform(next);
    setSelectedId(nextContent?.id ?? null);
    updateLocation(next, nextContent?.id ?? null);
  }

  function chooseContent(content: ContentSummary) {
    setPlatform(content.platform);
    setSelectedId(content.id);
    updateLocation(content.platform, content.id);
  }

  const onDraftChange = useCallback((snapshot: PreviewSnapshot) => setPreview(snapshot), []);

  const onAskRefine = useCallback((request: ArtifactRefineRequest) => {
    if (!selectedId) return;
    const params = new URLSearchParams({ contentId: selectedId, prefill: request.instruction });
    router.push(`/creator?${params.toString()}`);
  }, [router, selectedId]);

  return (
    <AppShell
      title="编辑中心"
      description="选择平台与选题，完成编辑、预览和发布准备。"
      eyebrow="STARTRACE / EDITORIAL DESK"
      contentClassName="px-3 pb-24 pt-3 sm:px-4 lg:px-5 lg:pb-5"
      actions={
        <Button size="sm" asChild>
          <Link href="/creator?prefill=我想创建一条新内容，请先帮我确定平台、选题角度和内容结构。">
            <Plus data-icon="inline-start" />新建内容
          </Link>
        </Button>
      }
    >
      <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_20rem]" data-testid="editor-center">
        <aside className="min-w-0 overflow-hidden rounded-2xl border bg-card lg:h-[calc(100dvh-104px)]">
          <div className="border-b p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">发布平台</p>
            <Select value={platform} onValueChange={(value) => choosePlatform(value as PlatformId)}>
              <SelectTrigger aria-label="选择发布平台"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PLATFORM_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {PLATFORM_DEFINITIONS[id].displayName} · {platformCounts[id]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <label className="relative mt-3 block">
              <span className="sr-only">搜索选题或内容</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="搜索选题或内容" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>

          <div className="max-h-[340px] overflow-y-auto p-2 lg:max-h-none lg:h-[calc(100%-129px)]" aria-label={`${PLATFORM_DEFINITIONS[platform].displayName}内容列表`}>
            {contentsQuery.isPending ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />加载内容…</div>
            ) : visible.length ? (
              <ul className="space-y-1.5">
                {visible.map((content) => {
                  const active = content.id === selectedId;
                  const generating = content._count.revisions === 0;
                  return (
                    <li key={content.id}>
                      <button
                        type="button"
                        className={cn(
                          "w-full rounded-xl border px-3 py-3 text-left transition-colors",
                          active ? "border-primary/30 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/45",
                        )}
                        aria-current={active ? "page" : undefined}
                        onClick={() => chooseContent(content)}
                      >
                        <div className="flex items-start gap-2">
                          <span className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-5">{content.title || "未命名内容"}</span>
                          {active ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                          {generating ? <CircleDashed className="h-3 w-3 animate-spin" /> : <FilePenLine className="h-3 w-3" />}
                          <span>{generating ? "生成中 · 尚无版本" : `${content._count.revisions} 个版本`}</span>
                          <span className="ml-auto">{relativeTime(content.updatedAt)}</span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="px-3 py-10 text-center">
                <p className="text-sm font-medium">这个平台还没有内容</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">从创作对话选择 {PLATFORM_DEFINITIONS[platform].displayName}，生成后会自动出现在这里。</p>
                <Button className="mt-4" size="sm" variant="outline" asChild>
                  <Link href={`/creator?prefill=${encodeURIComponent(`请为 ${PLATFORM_DEFINITIONS[platform].displayName} 创建一条新内容。`)}`}>开始创作<ArrowRight data-icon="inline-end" /></Link>
                </Button>
              </div>
            )}
          </div>
        </aside>

        <section className="min-w-0 overflow-hidden rounded-2xl border bg-card lg:h-[calc(100dvh-104px)]" aria-label="内容编辑器">
          {selected ? (
            <ArtifactPanel
              key={selected.id}
              contentId={selected.id}
              embedded
              onClose={NOOP}
              onAskRefine={onAskRefine}
              onDraftChange={onDraftChange}
            />
          ) : contentsQuery.isPending ? null : (
            <EmptyEditor hasContents={contents.length > 0} />
          )}
        </section>

        <aside className="min-w-0 overflow-hidden rounded-2xl border bg-card lg:col-start-2 xl:col-start-3 xl:row-start-1 xl:h-[calc(100dvh-104px)]" aria-label="平台预览与发布设置">
          {selected ? (
            <Tabs value={rightTab} onValueChange={(value) => setRightTab(value as "preview" | "settings")} className="flex h-full min-h-[480px] flex-col">
              <div className="border-b p-3">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="preview">平台预览</TabsTrigger>
                  <TabsTrigger value="settings"><Settings2 className="mr-1 h-4 w-4" />发布设置</TabsTrigger>
                </TabsList>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <TabsContent value="preview" className="m-0 p-4">
                  {preview ? (
                    <>
                      {preview.previewing ? <Badge variant="outline" className="mb-3">历史版本只读预览</Badge> : null}
                      <PlatformPreview platform={preview.content.platform} draft={preview.draft} />
                    </>
                  ) : (
                    <div className="flex min-h-56 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />同步编辑内容…</div>
                  )}
                </TabsContent>
                <TabsContent value="settings" className="m-0 p-4">
                  <PublishSettingsPanel contentId={selected.id} platform={selected.platform} />
                </TabsContent>
              </div>
              <div className="border-t p-3">
                {PLATFORM_DEFINITIONS[selected.platform].publishing === "export_only" ? (
                  <div className="text-xs leading-5 text-muted-foreground">当前平台需在编辑器中导出内容包，再到平台手动发布。发布设置会保留为检查清单。</div>
                ) : (
                  <Button className="w-full" asChild>
                    <Link href={`/publish?from=editor&contentId=${selected.id}`}>进入发布中心<ArrowRight data-icon="inline-end" /></Link>
                  </Button>
                )}
              </div>
            </Tabs>
          ) : (
            <div className="flex min-h-80 items-center justify-center px-6 text-center text-sm leading-6 text-muted-foreground">选择一条内容后，这里会显示对应平台的实时预览与发布设置。</div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function EmptyEditor({ hasContents }: { hasContents: boolean }) {
  return (
    <div className="flex h-full min-h-[460px] flex-col items-center justify-center px-6 text-center">
      <FilePenLine className="h-8 w-8 text-muted-foreground" />
      <h2 className="mt-4 text-lg font-semibold">{hasContents ? "请选择一条内容" : "还没有可编辑的内容"}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{hasContents ? "在左侧切换平台并选择具体选题，编辑器会载入其最新版本。" : "先从创作对话建立平台任务；内容生成完成后会自动进入编辑中心。"}</p>
      <Button className="mt-5" asChild><Link href="/creator">前往创作<ArrowRight data-icon="inline-end" /></Link></Button>
    </div>
  );
}

function relativeTime(value: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
