"use client";

import { useCallback, useEffect, useState } from "react";
import { BarChart3, Check, CircleAlert, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { readApiJson } from "@/lib/api-client";
import { DataSourceBadge } from "@/components/performance/metric-timeline";

type Snapshot = { id: string; window: "d1" | "d3" | "d7" | "manual"; observedAt: string; viewCount: number | null; likeCount: number | null; collectCount: number | null; commentCount: number | null; shareCount: number | null; followerDelta: number | null; dataSource: "mock-fixture" | "provider" };
type Availability = { available: true } | { available: false; reason: string; message: string };
type Retrospective = { id: string; status: "pending" | "drafted"; dueAt: string | null; predictedScore: unknown; actualOutcome: unknown; variance: unknown; conclusions: string | null; ruleProposal: unknown; content: { title: string | null; platform: "xiaohongshu" | "douyin"; scoreSnapshot: unknown }; publishRecord: { publicUrl: string | null; publishedAt: string | null; availability: Availability; metricSnapshots: Snapshot[] } | null; scoringRubric: { name: string; version: number } | null };

export default function RetrospectivesPage() {
  const [items, setItems] = useState<Retrospective[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [conclusions, setConclusions] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readApiJson<{ retrospectives: Retrospective[] }>(await fetch("/api/retrospectives/due", { cache: "no-store" }));
      setItems(data.retrospectives);
      setConclusions(Object.fromEntries(data.retrospectives.map((item) => [item.id, item.conclusions ?? ""])));
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "复盘加载失败"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(item: Retrospective, status: "drafted" | "accepted" | "dismissed") {
    setBusyId(item.id);
    try {
      await readApiJson(await fetch(`/api/retrospectives/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, conclusions: conclusions[item.id] ?? "" }) }));
      if (status === "drafted") toast.success("复盘草稿已保存");
      else { setItems((current) => current.filter((entry) => entry.id !== item.id)); toast.success(status === "accepted" ? "复盘已确认" : "本次规则建议已忽略"); }
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setBusyId(null); }
  }

  return (
    <AppShell title="数据复盘" description="对照发布前预测与 D+1 / D+3 / D+7 实际指标；规则变化必须回测并由人确认。" actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" />刷新</Button>}>
      <div className="space-y-5">
        <Card className="border-amber-200 bg-amber-50/50"><CardContent className="flex items-start gap-3 p-4"><CircleAlert className="mt-0.5 h-5 w-5 text-amber-700" /><div><p className="text-sm font-medium text-amber-950">规则不会自动进化</p><p className="mt-1 text-xs leading-5 text-amber-800">只有连续三次同方向误判才产生候选建议；新规则必须完成回测并由你明确确认后才能启用。</p></div></CardContent></Card>
        {loading ? <div className="space-y-4">{[0, 1].map((item) => <div key={item} className="h-96 animate-pulse rounded-xl bg-muted" />)}</div> : !items.length ? <Card><CardContent className="py-20 text-center"><BarChart3 className="mx-auto h-7 w-7 text-muted-foreground" /><p className="mt-4 font-medium">目前没有到期复盘</p><p className="mt-1 text-sm text-muted-foreground">作品发布后会自动安排 D+1、D+3、D+7 指标任务，D+7 到期后出现在这里。</p></CardContent></Card> : items.map((item) => <RetrospectiveCard key={item.id} item={item} value={conclusions[item.id] ?? ""} onChange={(value) => setConclusions((current) => ({ ...current, [item.id]: value }))} busy={busyId === item.id} onSave={() => void save(item, "drafted")} onAccept={() => void save(item, "accepted")} onDismiss={() => void save(item, "dismissed")} />)}
      </div>
    </AppShell>
  );
}

function RetrospectiveCard({ item, value, onChange, busy, onSave, onAccept, onDismiss }: { item: Retrospective; value: string; onChange: (value: string) => void; busy: boolean; onSave: () => void; onAccept: () => void; onDismiss: () => void }) {
  const predicted = asRecord(item.predictedScore ?? item.content.scoreSnapshot);
  const variance = asRecord(item.variance);
  const proposal = asRecord(item.ruleProposal);
  return <Card><CardHeader><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2"><Badge variant="outline">{item.content.platform === "douyin" ? "抖音" : "小红书"}</Badge><Badge variant="outline">{item.status === "drafted" ? "待确认" : "待复盘"}</Badge>{item.scoringRubric ? <span className="text-xs text-muted-foreground">{item.scoringRubric.name} v{item.scoringRubric.version}</span> : null}</div><CardTitle>{item.content.title || "未命名作品"}</CardTitle><CardDescription className="mt-1">发布于 {item.publishRecord?.publishedAt ? new Date(item.publishRecord.publishedAt).toLocaleString("zh-CN") : "—"}</CardDescription></div>{item.publishRecord?.publicUrl ? <Button variant="outline" size="sm" asChild><a href={item.publishRecord.publicUrl} target="_blank" rel="noreferrer">查看作品 <ExternalLink className="h-4 w-4" /></a></Button> : null}</div></CardHeader><CardContent className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-3"><Score label="发布前预测" value={number(predicted.total)} /><Score label="实际结果分" value={number(variance.outcomeScore)} /><Score label="预测偏差" value={number(variance.delta)} signed /></div>
    <div><p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">指标时间线</p>{item.publishRecord?.metricSnapshots.some((snapshot) => snapshot.dataSource === "mock-fixture") ? <p className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs leading-5 text-sky-900" data-testid="retrospective-mock-note">该记录含模拟/夹具指标（本地模拟供应商产生），仅用于验证复盘流程，不代表真实平台表现。</p> : null}<div className="overflow-x-auto rounded-lg border"><table className="min-w-[640px] w-full text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-left font-medium">窗口</th><th className="px-3 py-2 text-left font-medium">来源</th><th className="px-3 py-2 text-right font-medium">播放</th><th className="px-3 py-2 text-right font-medium">点赞</th><th className="px-3 py-2 text-right font-medium">收藏</th><th className="px-3 py-2 text-right font-medium">评论</th><th className="px-3 py-2 text-right font-medium">分享</th></tr></thead><tbody className="divide-y">{item.publishRecord?.metricSnapshots.map((snapshot) => <tr key={snapshot.id}><td className="px-3 py-2 font-mono uppercase">{snapshot.window}</td><td className="px-3 py-2"><DataSourceBadge dataSource={snapshot.dataSource} /></td><MetricCell value={snapshot.viewCount} /><MetricCell value={snapshot.likeCount} /><MetricCell value={snapshot.collectCount} /><MetricCell value={snapshot.commentCount} /><MetricCell value={snapshot.shareCount} /></tr>)}</tbody></table>{!item.publishRecord?.metricSnapshots.length ? <p className="p-6 text-center text-sm text-muted-foreground" data-testid="retrospective-no-metrics">{item.publishRecord && !item.publishRecord.availability.available ? item.publishRecord.availability.message : "指标任务尚未返回数据；到期后会自动补齐 D+1 / D+3 / D+7。"}</p> : null}</div></div>
    {proposal.status === "candidate" ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="font-medium text-amber-950">评分规则候选调整</p><p className="mt-2 text-sm leading-6 text-amber-900">{string(proposal.reason) || "检测到连续同方向误判。"}</p><p className="mt-2 text-xs text-amber-800">这只是候选建议；还需创建新版本、至少 3 条样本回测优于旧规则，并再次确认启用。</p></div> : <div className="rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">当前没有规则调整建议。系统不会因单次偏差修改评分规则。</div>}
    <label><span className="mb-2 block text-sm font-medium">复盘结论</span><Textarea className="min-h-32" value={value} onChange={(event) => onChange(event.target.value)} placeholder="哪些判断准确？哪里高估或低估？下一条内容具体改什么？" /></label>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onSave} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存草稿</Button>{proposal.status === "candidate" ? <Button variant="ghost" className="text-muted-foreground" onClick={onDismiss} disabled={busy}><X className="h-4 w-4" />忽略规则建议</Button> : null}<Button className="ml-auto" onClick={onAccept} disabled={busy || !value.trim()}><Check className="h-4 w-4" />确认复盘</Button></div>
  </CardContent></Card>;
}

function Score({ label, value, signed }: { label: string; value: number | null; signed?: boolean }) { return <div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 font-mono text-2xl">{value == null ? "—" : `${signed && value > 0 ? "+" : ""}${value}`}</p></div>; }
function MetricCell({ value }: { value: number | null }) { return <td className="px-3 py-2 text-right font-mono">{value == null ? "—" : value.toLocaleString("zh-CN")}</td>; }
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function string(value: unknown): string { return typeof value === "string" ? value : ""; }
