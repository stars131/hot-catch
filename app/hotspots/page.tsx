"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronRight,
  CircleAlert,
  Flame,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  SlidersHorizontal,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { readApiJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type {
  HotspotPayload,
  HotspotSourceDefinition,
  HotspotSourceHealth,
  HotspotTopic,
} from "@/lib/hotspots/hotspot-service";

type WindowValue = "1小时" | "24小时" | "7天";

const WINDOWS: WindowValue[] = ["1小时", "24小时", "7天"];
const TECH_SOURCE_CODES = new Set(["github", "hackernews", "juejin", "sspai", "v2ex", "hellogithub", "ithome", "36kr"]);

type HotspotAiInsightView = {
  id: string;
  topicKey: string;
  category: string;
  lifecycle: "emerging" | "rising" | "peaking" | "declining";
  audience: string | null;
  summary: string;
  recommendation: string;
  riskLevel: "low" | "medium" | "high";
  relevanceScore: number;
  opportunityScore: number;
  saturationScore: number;
  suggestedAngles: string[];
  evidence: string[];
};

export default function HotspotsPage() {
  const [payload, setPayload] = useState<HotspotPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [platform, setPlatform] = useState("全平台");
  const [windowValue, setWindowValue] = useState<WindowValue>("24小时");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [cookieOpen, setCookieOpen] = useState(false);
  const [cookieSource, setCookieSource] = useState<HotspotSourceDefinition | null>(null);
  const [cookie, setCookie] = useState("");
  const [upstream, setUpstream] = useState("");
  const [cookieSaving, setCookieSaving] = useState(false);
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const [insights, setInsights] = useState<HotspotAiInsightView[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/hotspots${refresh ? "?refresh=1" : ""}`, {
        cache: "no-store",
      });
      const next = await readApiJson<HotspotPayload>(response);
      setPayload(next);
      setSelectedId((current) =>
        current && next.topics.some((topic) => topic.id === current)
          ? current
          : next.topics[0]?.id ?? null,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "热点加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const topics = useMemo(() => {
    const all = payload?.topics ?? [];
    const filtered = platform === "全平台"
      ? all
      : platform === "技术圈"
        ? all.filter((topic) => topic.sources.some((source) => TECH_SOURCE_CODES.has(source.platformCode)))
        : all.filter(
            (topic) => topic.platform === platform || topic.platformShare.some((item) => item.label === platform),
          );
    const scoreByTopic = new Map(insights.map((item) => [item.topicKey, item.opportunityScore]));
    if (!scoreByTopic.size) return filtered;
    return [...filtered].sort(
      (left, right) => (scoreByTopic.get(right.id) ?? -1) - (scoreByTopic.get(left.id) ?? -1),
    );
  }, [payload?.topics, platform, insights]);

  const selected = topics.find((topic) => topic.id === selectedId) ?? topics[0] ?? null;
  const insightByTopic = useMemo(
    () => new Map(insights.map((item) => [item.topicKey, item])),
    [insights],
  );
  const selectedInsight = selected ? insightByTopic.get(selected.id) ?? null : null;
  const failures = payload?.sourceHealth.filter((source) => !source.ok) ?? [];

  async function collect(topic: HotspotTopic) {
    setCollectingId(topic.id);
    try {
      const source = topic.sources[0];
      await readApiJson(
        await fetch("/api/ideas", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "hotspot",
            platform: topic.platform === "抖音" ? "douyin" : "xiaohongshu",
            title: topic.title,
            angle: topic.angles[0]?.description,
            notes: topic.riskNotes.join("\n"),
            hotspot: {
              id: topic.id,
              category: topic.category,
              heat: topic.heat,
              rank: source?.rank,
              source: source?.platform,
              sourceUrl: source?.url,
              keywords: topic.keywords,
              evidence: { sources: topic.sources, window: windowValue },
            },
          }),
        }),
      );
      toast.success("已收藏到选题库", { description: "下一步请到选题库决定创作平台和内容方向。" });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "收藏失败");
    } finally {
      setCollectingId(null);
    }
  }

  async function analyzeVisibleTopics() {
    if (!topics.length) return;
    setAnalyzing(true);
    try {
      const result = await readApiJson<{ insights: HotspotAiInsightView[]; analyzedCount: number }>(
        await fetch("/api/hotspots/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topicIds: topics.slice(0, 12).map((topic) => topic.id) }),
        }),
      );
      setInsights((current) => {
        const merged = new Map(current.map((item) => [item.topicKey, item]));
        result.insights.forEach((item) => merged.set(item.topicKey, item));
        return [...merged.values()];
      });
      toast.success(`AI 已分析 ${result.analyzedCount} 个热点`, {
        description: "清单已按机会分排序，原始热度和来源证据保持不变。",
      });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "AI 热点分析失败", {
        description: "请先在连接设置中配置你自己的模型凭证。",
      });
    } finally {
      setAnalyzing(false);
    }
  }

  function openCookie(source?: HotspotSourceDefinition) {
    const target = source ?? payload?.sourceCatalog.find((item) => item.requiresCookie) ?? null;
    setCookieSource(target);
    setCookie("");
    setUpstream("");
    setCookieOpen(true);
  }

  async function saveCookie(clear = false) {
    if (!cookieSource) return;
    setCookieSaving(true);
    try {
      const result = await readApiJson<{ sources: HotspotSourceDefinition[] }>(
        await fetch("/api/hotspots/cookies", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: cookieSource.code, cookie, upstream, clear }),
        }),
      );
      setPayload((current) => (current ? { ...current, sourceCatalog: result.sources } : current));
      setCookieSource(result.sources.find((item) => item.code === cookieSource.code) ?? cookieSource);
      setCookie("");
      setUpstream("");
      toast.success(clear ? "本地配置已清除" : "来源配置已保存");
      await load(true);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败");
    } finally {
      setCookieSaving(false);
    }
  }

  return (
    <AppShell
      title="热点研究"
      description="汇总多源趋势、保留来源证据；这里不直接生成内容。"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void analyzeVisibleTopics()} disabled={analyzing || !topics.length}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI 筛选与建议
          </Button>
          <Button variant="outline" size="sm" onClick={() => openCookie()}>
            <KeyRound className="h-4 w-4" /> 来源连接
          </Button>
          <Button size="sm" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /> 刷新
          </Button>
        </div>
      }
    >
      <div className="space-y-5 overflow-x-hidden">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="聚合条目" value={payload?.summary.totalItems ?? "—"} />
          <Metric label="在线来源" value={payload ? `${payload.summary.activeSources}/${payload.sourceHealth.length}` : "—"} tone={failures.length ? "amber" : "green"} />
          <Metric label="跨平台话题" value={payload?.summary.crossPlatformTopics ?? "—"} />
          <Metric label="Cookie 来源" value={payload ? `${payload.summary.cookieConfiguredCount}/${payload.summary.cookieSourceCount}` : "—"} />
        </section>

        {failures.length ? (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{failures.length} 个来源暂时不可用，已显示其余可用结果。</p>
              <p className="mt-1 text-xs text-amber-800 sm:hidden">
                待恢复：{failures.slice(0, 5).map((item) => item.platform).join("、")}
                {failures.length > 5 ? ` 等 ${failures.length} 个来源` : ""}。
              </p>
              <p className="mt-1 hidden text-xs text-amber-800 sm:block">{failures.slice(0, 4).map((item) => `${item.platform}：${item.message ?? "请求失败"}`).join("；")}</p>
            </div>
          </div>
        ) : null}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>趋势清单</CardTitle>
                <CardDescription>{payload?.generatedAt ? `更新于 ${new Date(payload.generatedAt).toLocaleString("zh-CN")}` : "正在读取来源"}</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="md:hidden" onClick={() => setFilterOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" /> 筛选
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="hidden items-center justify-between gap-4 md:flex">
              <PlatformFilters values={payload?.platforms ?? ["全平台"]} value={platform} onChange={setPlatform} />
              <div className="flex shrink-0 rounded-lg border bg-muted/40 p-1">
                {WINDOWS.map((value) => (
                  <button key={value} type="button" onClick={() => setWindowValue(value)} className={cn("rounded-md px-3 py-1.5 text-xs", value === windowValue ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground")}>{value}</button>
                ))}
              </div>
            </div>

            <div className="md:hidden">
              <PlatformFilters values={payload?.platforms ?? ["全平台"]} value={platform} onChange={setPlatform} />
            </div>

            {loading && !payload ? <TopicSkeleton /> : error ? <LoadError message={error} onRetry={() => void load(true)} /> : !topics.length ? <EmptyTopics /> : (
              <>
                <div className="hidden overflow-hidden rounded-lg border md:block">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-muted/60 text-xs text-muted-foreground">
                      <tr><th className="px-4 py-3 font-medium">话题</th><th className="px-4 py-3 font-medium">平台</th><th className="px-4 py-3 font-medium">热度</th><th className="px-4 py-3 font-medium">变化</th><th className="px-4 py-3 font-medium">状态</th><th className="w-12" /></tr>
                    </thead>
                    <tbody className="divide-y">
                      {topics.map((topic) => <TopicRow key={topic.id} topic={topic} insight={insightByTopic.get(topic.id)} active={selected?.id === topic.id} onSelect={() => setSelectedId(topic.id)} />)}
                    </tbody>
                  </table>
                </div>
                <div className="space-y-3 md:hidden">
                  {topics.map((topic) => <TopicCard key={topic.id} topic={topic} insight={insightByTopic.get(topic.id)} active={selected?.id === topic.id} onSelect={() => setSelectedId(topic.id)} onCollect={() => void collect(topic)} collecting={collectingId === topic.id} />)}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {selected ? (
          <Card className="hidden md:block">
            <CardHeader>
              <div className="flex items-start justify-between gap-6">
                <div><div className="mb-2 flex items-center gap-2"><Badge variant="outline">{selected.platform}</Badge><StatusBadge status={selected.status} /></div><CardTitle className="text-xl">{selected.title}</CardTitle><CardDescription>{selected.category} · 预计峰值 {selected.peakEta}</CardDescription></div>
                <Button onClick={() => void collect(selected)} disabled={collectingId === selected.id}>{collectingId === selected.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}收藏到选题库</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-[1fr_340px]">
              <div>
                {selectedInsight ? <AiInsightPanel insight={selectedInsight} /> : null}
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">可切入角度</p>
                <div className="space-y-3">{selected.angles.map((angle) => <div key={angle.title} className="rounded-lg border bg-muted/25 p-4"><div className="flex items-center justify-between gap-4"><p className="font-medium">{angle.title}</p><span className="font-mono text-sm text-brand">{angle.heat}</span></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{angle.description}</p></div>)}</div>
              </div>
              <div className="space-y-4">
                <EvidencePanel topic={selected} />
                {selected.riskNotes.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-950">表达风险</p><ul className="mt-2 space-y-1 text-xs leading-5 text-amber-900">{selected.riskNotes.map((risk) => <li key={risk}>· {risk}</li>)}</ul></div> : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
        <SheetContent side="right" className="w-full max-w-none overflow-y-auto sm:max-w-sm">
          <SheetHeader className="sticky top-0 z-10 -mx-6 -mt-6 border-b bg-background px-6 py-5 text-left"><SheetTitle>热点筛选</SheetTitle><SheetDescription>调整时间范围与来源状态。</SheetDescription></SheetHeader>
          <div className="space-y-6 py-6">
            <div><p className="mb-3 text-sm font-medium">时间范围</p><div className="grid grid-cols-3 gap-2">{WINDOWS.map((value) => <Button key={value} variant={windowValue === value ? "default" : "outline"} onClick={() => setWindowValue(value)}>{value}</Button>)}</div></div>
            <SourceHealthList sources={payload?.sourceHealth ?? []} onConfigure={(code) => openCookie(payload?.sourceCatalog.find((item) => item.code === code))} />
          </div>
        </SheetContent>
      </Sheet>

      <CookieSheet open={cookieOpen} onOpenChange={setCookieOpen} sources={payload?.sourceCatalog.filter((source) => source.requiresCookie) ?? []} selected={cookieSource} onSelect={(source) => { setCookieSource(source); setCookie(""); setUpstream(""); }} cookie={cookie} upstream={upstream} onCookie={setCookie} onUpstream={setUpstream} saving={cookieSaving} onSave={() => void saveCookie()} onClear={() => void saveCookie(true)} />
    </AppShell>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "green" | "amber" }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-2 font-mono text-2xl font-medium tracking-tight", tone === "green" && "text-emerald-700", tone === "amber" && "text-amber-700")}>{value}</p></CardContent></Card>;
}

function PlatformFilters({ values, value, onChange }: { values: string[]; value: string; onChange: (value: string) => void }) {
  return <div className="scrollbar-none flex max-w-full gap-2 overflow-x-auto pb-1 whitespace-nowrap">{values.map((item) => <button key={item} type="button" onClick={() => onChange(item)} className={cn("shrink-0 rounded-lg border px-3 py-2 text-xs transition-colors", value === item ? "border-brand bg-brand text-white" : "bg-background text-muted-foreground hover:text-foreground")}>{item}</button>)}</div>;
}

function TopicRow({ topic, insight, active, onSelect }: { topic: HotspotTopic; insight?: HotspotAiInsightView; active: boolean; onSelect: () => void }) {
  return <tr onClick={onSelect} className={cn("cursor-pointer transition-colors hover:bg-muted/40", active && "bg-brand/[0.04]")}><td className="px-4 py-3"><p className="font-medium text-foreground">{topic.title}</p><p className="mt-1 text-xs text-muted-foreground">{topic.category} · {topic.sources.length} 个来源{insight ? ` · AI 机会 ${insight.opportunityScore}` : ""}</p></td><td className="px-4 py-3 text-muted-foreground">{topic.platform}</td><td className="px-4 py-3 font-mono font-medium">{topic.heat.toFixed(1)}</td><td className={cn("px-4 py-3 font-mono text-xs", topic.change >= 0 ? "text-emerald-700" : "text-red-700")}>{topic.change >= 0 ? "+" : ""}{topic.change}%</td><td className="px-4 py-3"><StatusBadge status={topic.status} /></td><td><ChevronRight className="h-4 w-4 text-muted-foreground" /></td></tr>;
}

function TopicCard({ topic, insight, active, onSelect, onCollect, collecting }: { topic: HotspotTopic; insight?: HotspotAiInsightView; active: boolean; onSelect: () => void; onCollect: () => void; collecting: boolean }) {
  return <article className={cn("rounded-xl border bg-card p-4", active && "border-brand/50")}><button type="button" className="w-full text-left" onClick={onSelect}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex items-center gap-2"><Badge variant="outline">{topic.platform}</Badge><StatusBadge status={topic.status} /></div><h3 className="font-semibold leading-6">{topic.title}</h3><p className="mt-1 text-xs text-muted-foreground">{topic.category} · {topic.sources.length} 个来源{insight ? ` · AI 机会 ${insight.opportunityScore}` : ""}</p></div><div className="shrink-0 text-right"><p className="font-mono text-xl">{topic.heat.toFixed(1)}</p><p className={cn("mt-1 flex items-center justify-end gap-1 text-xs", topic.change >= 0 ? "text-emerald-700" : "text-red-700")}>{topic.change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{Math.abs(topic.change)}%</p></div></div></button>{active ? <div className="mt-4 border-t pt-4">{insight ? <p className="mb-2 rounded-md bg-violet-50 p-2 text-xs leading-5 text-violet-900">{insight.recommendation}</p> : null}<p className="text-sm font-medium">{topic.angles[0]?.title ?? "值得继续观察"}</p><p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{topic.angles[0]?.description ?? topic.keywords.join("、")}</p><Button className="mt-4 w-full" onClick={onCollect} disabled={collecting}>{collecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}收藏到选题库</Button></div> : null}</article>;
}

function AiInsightPanel({ insight }: { insight: HotspotAiInsightView }) {
  const lifecycle = { emerging: "萌芽", rising: "上升", peaking: "高峰", declining: "回落" }[insight.lifecycle];
  const risk = { low: "低风险", medium: "中风险", high: "高风险" }[insight.riskLevel];
  return <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50/70 p-4"><div className="flex flex-wrap items-center gap-2"><Sparkles className="h-4 w-4 text-violet-700" /><p className="font-semibold text-violet-950">AI 研究建议</p><Badge variant="outline" className="border-violet-200 bg-white text-violet-800">{lifecycle}</Badge><Badge variant="outline" className="border-violet-200 bg-white text-violet-800">{risk}</Badge></div><div className="mt-3 grid grid-cols-3 gap-2"><AiScore label="相关" value={insight.relevanceScore} /><AiScore label="机会" value={insight.opportunityScore} /><AiScore label="饱和" value={insight.saturationScore} /></div><p className="mt-4 text-sm leading-6 text-violet-950">{insight.summary}</p><p className="mt-3 rounded-lg bg-white/80 p-3 text-sm leading-6 text-violet-950"><span className="font-medium">建议：</span>{insight.recommendation}</p><div className="mt-3 flex flex-wrap gap-2">{insight.suggestedAngles.map((angle) => <span key={angle} className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs text-violet-900">{angle}</span>)}</div><details className="mt-3 text-xs text-violet-900"><summary className="cursor-pointer font-medium">查看 AI 使用的证据</summary><ul className="mt-2 space-y-1">{insight.evidence.map((item) => <li key={item}>· {item}</li>)}</ul></details></div>;
}

function AiScore({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg bg-white p-2 text-center"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 font-mono text-lg font-semibold text-violet-800">{value}</p></div>;
}

function StatusBadge({ status }: { status: HotspotTopic["status"] }) {
  const styles = status === "爆发中" ? "border-red-200 bg-red-50 text-red-700" : status === "上升" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "回落" ? "border-amber-200 bg-amber-50 text-amber-700" : "";
  return <Badge variant="outline" className={styles}>{status === "爆发中" ? <Flame className="mr-1 h-3 w-3" /> : null}{status}</Badge>;
}

function EvidencePanel({ topic }: { topic: HotspotTopic }) {
  return <div className="rounded-lg border p-4"><p className="text-sm font-semibold">来源证据</p><div className="mt-3 space-y-2">{topic.sources.slice(0, 5).map((source) => <a key={`${source.platformCode}-${source.id}`} href={source.url} target="_blank" rel="noreferrer" className="block rounded-md bg-muted/40 px-3 py-2 text-xs hover:bg-muted"><span className="font-medium">{source.platform} #{source.rank}</span><span className="ml-2 text-muted-foreground">{source.title}</span></a>)}</div></div>;
}

function SourceHealthList({ sources, onConfigure }: { sources: HotspotSourceHealth[]; onConfigure: (code: string) => void }) {
  return <div><p className="mb-3 text-sm font-medium">来源状态</p><div className="space-y-2">{sources.map((source) => <button key={source.platformCode} type="button" onClick={() => source.requiresCookie && onConfigure(source.platformCode)} className="flex w-full items-center justify-between rounded-lg border p-3 text-left"><span><span className="block text-sm font-medium">{source.platform}</span><span className="block text-xs text-muted-foreground">{source.count} 条 · {source.backend}</span></span><span className={cn("h-2 w-2 rounded-full", source.ok ? "bg-emerald-600" : "bg-red-600")} /></button>)}</div></div>;
}

function CookieSheet(props: { open: boolean; onOpenChange: (open: boolean) => void; sources: HotspotSourceDefinition[]; selected: HotspotSourceDefinition | null; onSelect: (source: HotspotSourceDefinition) => void; cookie: string; upstream: string; onCookie: (value: string) => void; onUpstream: (value: string) => void; saving: boolean; onSave: () => void; onClear: () => void }) {
  return <Sheet open={props.open} onOpenChange={props.onOpenChange}><SheetContent side="right" className="flex h-full w-full max-w-none flex-col p-0 sm:max-w-xl"><SheetHeader className="shrink-0 border-b bg-background px-6 py-5 pr-12 text-left"><SheetTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />热点来源连接</SheetTitle><SheetDescription>本地开发保存到忽略提交的 JSON；生产环境必须使用用户级加密凭证。</SheetDescription></SheetHeader><div className="min-h-0 flex-1 overflow-y-auto px-6 py-5"><div className="mb-5 flex gap-2 overflow-x-auto pb-2">{props.sources.map((source) => <button key={source.code} type="button" onClick={() => props.onSelect(source)} className={cn("shrink-0 rounded-lg border px-3 py-2 text-xs", props.selected?.code === source.code ? "border-brand bg-brand text-white" : "bg-background")}>{source.label}{source.cookieConfigured ? <Check className="ml-2 inline h-3 w-3" /> : null}</button>)}</div>{props.selected ? <div className="space-y-5"><div className="grid grid-cols-2 gap-3"><ConnectionStatus label="Cookie" active={props.selected.cookieConfigured} /><ConnectionStatus label="本地覆盖" active={Boolean(props.selected.localCookieConfigured || props.selected.localUpstreamConfigured)} /></div><label className="block"><span className="mb-2 block text-sm font-medium">Cookie</span><Textarea value={props.cookie} onChange={(event) => props.onCookie(event.target.value)} className="min-h-32 font-mono text-xs" placeholder="name=value; name2=value2" autoComplete="off" /></label><label className="block"><span className="mb-2 block text-sm font-medium">自建上游地址（可选）</span><Input value={props.upstream} onChange={(event) => props.onUpstream(event.target.value)} placeholder="https://parser.example.com/hot-list" autoComplete="off" /></label>{props.selected.notes ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{props.selected.notes}</p> : null}</div> : <p className="text-sm text-muted-foreground">没有需要 Cookie 的来源。</p>}</div><div className="flex shrink-0 gap-2 border-t bg-background px-6 py-4"><Button variant="outline" onClick={props.onClear} disabled={props.saving || !props.selected?.cookieConfigured}><Trash2 className="h-4 w-4" />清除</Button><Button className="ml-auto" onClick={props.onSave} disabled={props.saving || (!props.cookie.trim() && !props.upstream.trim())}>{props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}保存连接</Button></div></SheetContent></Sheet>;
}

function ConnectionStatus({ label, active }: { label: string; active: boolean }) { return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={cn("mt-1 text-sm font-medium", active ? "text-emerald-700" : "text-amber-700")}>{active ? "已配置" : "待配置"}</p></div>; }
function TopicSkeleton() { return <div className="space-y-3">{[0, 1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>; }
function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center"><CircleAlert className="mx-auto h-5 w-5 text-red-700" /><p className="mt-3 text-sm font-medium text-red-900">{message}</p><Button variant="outline" className="mt-4" onClick={onRetry}>重试</Button></div>; }
function EmptyTopics() { return <div className="rounded-lg border border-dashed p-10 text-center"><p className="font-medium">当前筛选没有热点</p><p className="mt-1 text-sm text-muted-foreground">换个平台或刷新来源后再试。</p></div>; }
