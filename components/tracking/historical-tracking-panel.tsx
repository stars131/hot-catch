"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Link2,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { readApiJson } from "@/lib/api-client";

type TrackingSnapshot = {
  id: string;
  source: "provider" | "public_api" | "manual" | "system";
  observedAt: string;
  viewCount: number | null;
  likeCount: number | null;
  collectCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  saveCount: number | null;
  clickCount: number | null;
};

type TrackingAnalysis = {
  id: string;
  status: "completed" | "limited" | "failed";
  summary: string;
  findings: string[];
  recommendations: string[];
  createdAt: string;
};

type TrackedPublication = {
  id: string;
  platform: "xiaohongshu" | "douyin" | "youtube" | "tiktok" | "instagram" | "x" | "reddit" | null;
  sourceKind: string;
  status: "pending" | "active" | "paused" | "connection_required" | "unavailable";
  publicUrl: string;
  title: string | null;
  excerpt: string | null;
  lastSyncedAt: string | null;
  nextSyncAt: string | null;
  lastError: string | null;
  metricSnapshots: TrackingSnapshot[];
  analyses: TrackingAnalysis[];
};

type MetricDraft = {
  viewCount: string;
  likeCount: string;
  collectCount: string;
  commentCount: string;
  shareCount: string;
};

const EMPTY_METRICS: MetricDraft = {
  viewCount: "",
  likeCount: "",
  collectCount: "",
  commentCount: "",
  shareCount: "",
};

const PLATFORM_LABELS: Record<string, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
  x: "X",
  reddit: "Reddit",
};

export function HistoricalTrackingPanel() {
  const [items, setItems] = useState<TrackedPublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [metricDrafts, setMetricDrafts] = useState<Record<string, MetricDraft>>({});

  const load = useCallback(async () => {
    try {
      const data = await readApiJson<{ publications: TrackedPublication[] }>(
        await fetch("/api/tracking", { cache: "no-store" }),
      );
      setItems(data.publications);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "历史作品加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addPublication() {
    if (!url.trim()) return;
    setAdding(true);
    try {
      const data = await readApiJson<{ publication: TrackedPublication; created: boolean; jobId: string | null }>(
        await fetch("/api/tracking", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ url: url.trim(), title: title.trim() || undefined, ownership: "owned" }),
        }),
      );
      setUrl("");
      setTitle("");
      setExpanded(data.publication.id);
      toast.success(data.created ? "历史作品已加入跟踪" : "该作品已经在跟踪中", {
        description: data.jobId
          ? "真实指标同步任务已进入队列。"
          : "可手工补充指标；需要官方连接的平台不会伪造数据。",
      });
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "加入跟踪失败");
    } finally {
      setAdding(false);
    }
  }

  async function refresh(item: TrackedPublication) {
    await runAction(item.id, "refresh", async () => {
      await readApiJson(await fetch(`/api/tracking/${item.id}/refresh`, { method: "POST" }));
      toast.success("指标同步任务已进入队列");
    });
  }

  async function analyze(item: TrackedPublication) {
    await runAction(item.id, "analyze", async () => {
      const result = await readApiJson<{ analysis: TrackingAnalysis }>(
        await fetch(`/api/tracking/${item.id}/analyze`, { method: "POST" }),
      );
      toast.success(result.analysis.status === "limited" ? "已完成内容级复盘" : "AI 数据复盘已完成");
    });
  }

  async function togglePaused(item: TrackedPublication) {
    const paused = item.status !== "paused";
    await runAction(item.id, "pause", async () => {
      await readApiJson(
        await fetch(`/api/tracking/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ paused }),
        }),
      );
      toast.success(paused ? "已暂停自动跟踪" : "已恢复跟踪");
    });
  }

  async function remove(item: TrackedPublication) {
    if (!window.confirm("删除这条跟踪记录及其指标快照？此操作不可撤销。")) return;
    await runAction(item.id, "delete", async () => {
      await readApiJson(await fetch(`/api/tracking/${item.id}`, { method: "DELETE" }));
      toast.success("跟踪记录已删除");
    });
  }

  async function saveManualMetrics(item: TrackedPublication) {
    const draft = metricDrafts[item.id] ?? EMPTY_METRICS;
    const body = Object.fromEntries(
      Object.entries(draft)
        .filter(([, value]) => value.trim() !== "")
        .map(([key, value]) => [key, Number(value)]),
    );
    if (!Object.keys(body).length) {
      toast.error("请至少填写一个指标");
      return;
    }
    await runAction(item.id, "metrics", async () => {
      await readApiJson(
        await fetch(`/api/tracking/${item.id}/metrics`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
      setMetricDrafts((current) => ({ ...current, [item.id]: EMPTY_METRICS }));
      toast.success("手工指标已保存，并标记为手工来源");
    });
  }

  async function runAction(id: string, action: string, callback: () => Promise<void>) {
    setBusy(`${id}:${action}`);
    try {
      await callback();
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "操作失败");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4" aria-labelledby="historical-tracking-title">
      <Card className="border-brand/20">
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"><Link2 className="size-4" /></span>
            <div>
              <CardTitle id="historical-tracking-title">加入历史作品</CardTitle>
              <CardDescription className="mt-1">粘贴以前发布的帖子、视频或文章链接。能通过已配置连接读取的指标会自动同步；其他平台可手工记录真实数据。</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px_auto]">
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://… 作品或文章链接" inputMode="url" />
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="标题（可选）" />
            <Button onClick={() => void addPublication()} disabled={adding || !url.trim()}>{adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}加入跟踪</Button>
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">当前自动同步：YouTube Data API、小红书/抖音 TikHub。TikTok、Instagram、X、Reddit 和普通网页不会绕过官方权限抓取；可以保存链接、手工补充指标并进行 AI 复盘。</p>
        </CardContent>
      </Card>

      {loading ? <div className="h-40 animate-pulse rounded-xl bg-muted" /> : !items.length ? <Card><CardContent className="py-12 text-center"><BarChart3 className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 font-medium">还没有历史作品</p><p className="mt-1 text-sm text-muted-foreground">把已发布内容的链接粘贴到上方即可开始。</p></CardContent></Card> : (
        <div className="space-y-3">
          {items.map((item) => {
            const open = expanded === item.id;
            const latest = item.metricSnapshots[0];
            const analysis = item.analyses[0];
            return <Card key={item.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2"><Badge variant="outline">{item.platform ? PLATFORM_LABELS[item.platform] : "网页文章"}</Badge><TrackingStatusBadge status={item.status} />{latest ? <Badge variant="outline">{snapshotSourceLabel(latest.source)}</Badge> : null}</div>
                    <CardTitle className="truncate text-base">{item.title || new URL(item.publicUrl).hostname}</CardTitle>
                    <CardDescription className="mt-1">{item.lastSyncedAt ? `最近同步 ${new Date(item.lastSyncedAt).toLocaleString("zh-CN")}` : "尚无同步指标"}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2"><Button size="sm" variant="outline" asChild><a href={item.publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-4" />原文</a></Button><Button size="sm" variant="ghost" onClick={() => setExpanded(open ? null : item.id)}>{open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}详情</Button></div>
                </div>
              </CardHeader>
              {open ? <CardContent className="space-y-5 border-t pt-5">
                {item.lastError ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{item.lastError}</p> : null}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><MetricValue label="播放/浏览" value={latest?.viewCount} /><MetricValue label="点赞" value={latest?.likeCount} /><MetricValue label="收藏" value={latest?.collectCount ?? latest?.saveCount} /><MetricValue label="评论" value={latest?.commentCount} /><MetricValue label="分享" value={latest?.shareCount} /></div>
                <div><p className="mb-2 text-sm font-medium">手工补充真实指标</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{Object.entries({ viewCount: "浏览", likeCount: "点赞", collectCount: "收藏", commentCount: "评论", shareCount: "分享" }).map(([key, label]) => <Input key={key} aria-label={label} type="number" min="0" placeholder={label} value={(metricDrafts[item.id] ?? EMPTY_METRICS)[key as keyof MetricDraft]} onChange={(event) => setMetricDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? EMPTY_METRICS), [key]: event.target.value } }))} />)}</div><Button className="mt-2" size="sm" variant="outline" onClick={() => void saveManualMetrics(item)} disabled={busy === `${item.id}:metrics`}>{busy === `${item.id}:metrics` ? <Loader2 className="size-4 animate-spin" /> : null}保存指标</Button></div>
                {analysis ? <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-4"><div className="flex items-center gap-2"><Sparkles className="size-4 text-violet-700" /><p className="font-medium text-violet-950">AI 复盘</p>{analysis.status === "limited" ? <Badge variant="outline">仅内容层</Badge> : null}</div><p className="mt-3 text-sm leading-6 text-violet-950">{analysis.summary}</p><div className="mt-3 grid gap-3 md:grid-cols-2"><AnalysisList title="发现" items={analysis.findings} /><AnalysisList title="下一步" items={analysis.recommendations} /></div></div> : null}
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void refresh(item)} disabled={busy !== null || item.status === "paused"}><RefreshCw className="size-4" />同步指标</Button><Button size="sm" variant="outline" onClick={() => void analyze(item)} disabled={busy !== null}>{busy === `${item.id}:analyze` ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}AI 复盘</Button><Button size="sm" variant="ghost" onClick={() => void togglePaused(item)} disabled={busy !== null}>{item.status === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}{item.status === "paused" ? "恢复" : "暂停"}</Button><Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => void remove(item)} disabled={busy !== null}><Trash2 className="size-4" />删除</Button></div>
              </CardContent> : null}
            </Card>;
          })}
        </div>
      )}
    </section>
  );
}

function TrackingStatusBadge({ status }: { status: TrackedPublication["status"] }) {
  const labels = { pending: "待同步", active: "跟踪中", paused: "已暂停", connection_required: "需连接/手工", unavailable: "暂不可用" };
  return <Badge variant="outline" className={status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "connection_required" ? "border-amber-200 bg-amber-50 text-amber-800" : ""}>{labels[status]}</Badge>;
}

function MetricValue({ label, value }: { label: string; value: number | null | undefined }) {
  return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-mono text-xl">{value == null ? "—" : value.toLocaleString("zh-CN")}</p></div>;
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return <div><p className="text-xs font-semibold text-violet-900">{title}</p><ul className="mt-2 space-y-1 text-xs leading-5 text-violet-950">{items.map((item) => <li key={item}>· {item}</li>)}</ul></div>;
}

function snapshotSourceLabel(source: TrackingSnapshot["source"]) {
  return { provider: "数据服务商", public_api: "官方公开 API", manual: "手工录入", system: "系统发布" }[source];
}
