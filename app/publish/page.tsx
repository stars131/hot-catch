"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Check, CircleAlert, ExternalLink, FileUp, Loader2, RefreshCw, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { readApiJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Platform = "xiaohongshu" | "douyin";
type Content = { id: string; title: string | null; platform: Platform; contentKind: string; status: string; updatedAt: string; _count: { revisions: number; publishRecords: number } };
type Account = { id: string; platform: Platform; name: string; avatarUrl?: string; status: "active" | "expired" | "invalid" };
type Upload = { name: string; type: "image" | "video"; url: string; size: number };
type RecordStatus = "draft" | "scheduled" | "uploading" | "submitted" | "awaiting_user" | "published" | "failed" | "canceled";
type PublishRecord = { id: string; contentId: string; platform: Platform; status: RecordStatus; providerAccountId: string; scheduledAt: string | null; submittedAt: string | null; publishedAt: string | null; shortLink: string | null; publicUrl: string | null; failureCode: string | null; failureReason: string | null; attemptCount: number; lastSyncedAt: string | null; createdAt: string; content?: { title: string | null } };
type Signature = { assetId: string; uploadUrl: string; method: "PUT" | "POST"; fields?: Record<string, string>; headers?: Record<string, string>; assetUrl?: string };

const FINAL_STATUSES = new Set<RecordStatus>(["published", "failed", "canceled"]);

export default function PublishPage() {
  const [contents, setContents] = useState<Content[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [records, setRecords] = useState<PublishRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [contentId, setContentId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const load = useCallback(async () => {
    try {
      const [contentData, accountData, recordData] = await Promise.all([
        readApiJson<{ contents: Content[] }>(await fetch("/api/content/list", { cache: "no-store" })),
        readApiJson<{ accounts: Account[] }>(await fetch("/api/integrations/aitoearn/accounts", { cache: "no-store" })).catch(() => ({ accounts: [] })),
        readApiJson<{ records: PublishRecord[] }>(await fetch("/api/publish/records", { cache: "no-store" })),
      ]);
      const ready = contentData.contents.filter((content) => content._count.revisions > 0);
      setContents(ready);
      setAccounts(accountData.accounts);
      setRecords(recordData.records);
      setContentId((current) => current || ready[0]?.id || "");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "发布数据加载失败"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const selectedContent = contents.find((content) => content.id === contentId);
  const matchingAccounts = useMemo(() => accounts.filter((account) => account.platform === selectedContent?.platform), [accounts, selectedContent?.platform]);
  useEffect(() => { setAccountId((current) => matchingAccounts.some((account) => account.id === current) ? current : matchingAccounts[0]?.id ?? ""); setUploads([]); }, [contentId, matchingAccounts]);

  const refreshRecord = useCallback(async (id: string, showToast = false) => {
    setSyncingId(id);
    try {
      const data = await readApiJson<{ record: PublishRecord }>(await fetch(`/api/publish/records/${id}?refresh=1`, { cache: "no-store" }));
      setRecords((current) => [data.record, ...current.filter((item) => item.id !== id)]);
      if (showToast) toast.success("发布状态已更新");
      return data.record;
    } catch (cause) { if (showToast) toast.error(cause instanceof Error ? cause.message : "状态刷新失败"); return null; }
    finally { setSyncingId(null); }
  }, []);

  useEffect(() => {
    if (!activeRecordId) return;
    const current = records.find((record) => record.id === activeRecordId);
    if (current && (FINAL_STATUSES.has(current.status) || current.status === "awaiting_user")) return;
    const timer = window.setInterval(() => { void refreshRecord(activeRecordId); }, 2000);
    return () => window.clearInterval(timer);
  }, [activeRecordId, records, refreshRecord]);

  async function uploadFile(file: File) {
    if (!selectedContent) return;
    const assetType = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!assetType) return toast.error("只支持图片或视频文件");
    if (selectedContent.platform === "xiaohongshu" && assetType !== "image") return toast.error("小红书图文只能上传图片");
    if (selectedContent.platform === "douyin" && assetType !== "video") return toast.error("抖音发布需要上传视频");
    setUploadProgress(10);
    try {
      const signed = await readApiJson<{ upload: Signature }>(await fetch("/api/publish/assets/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }) }));
      setUploadProgress(35);
      if (signed.upload.method === "POST") {
        const body = new FormData();
        Object.entries(signed.upload.fields ?? {}).forEach(([key, value]) => body.append(key, value));
        body.append("file", file);
        const response = await fetch(signed.upload.uploadUrl, { method: "POST", body });
        if (!response.ok) throw new Error(`素材直传失败（${response.status}）`);
      } else {
        const response = await fetch(signed.upload.uploadUrl, { method: "PUT", headers: { "content-type": file.type, ...(signed.upload.headers ?? {}) }, body: file });
        if (!response.ok) throw new Error(`素材直传失败（${response.status}）`);
      }
      setUploadProgress(80);
      const confirmed = await readApiJson<{ asset: { assetUrl: string } }>(await fetch("/api/publish/assets/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: signed.upload.assetId }) }));
      setUploads((current) => [...current, { name: file.name, type: assetType, url: confirmed.asset.assetUrl || signed.upload.assetUrl || "", size: file.size }]);
      setUploadProgress(100);
      toast.success("素材已直传 AiToEarn");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "上传失败"); }
    finally { window.setTimeout(() => setUploadProgress(null), 600); }
  }

  async function submit() {
    if (!selectedContent || !accountId || !uploads.length) return;
    setSubmitting(true);
    try {
      const data = await readApiJson<{ recordId: string; status: RecordStatus }>(await fetch("/api/publish/flows", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey.current }, body: JSON.stringify({ contentId: selectedContent.id, accountId, ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}), assets: uploads.map(({ url, type }) => ({ url, type })) }) }));
      setActiveRecordId(data.recordId);
      idempotencyKey.current = crypto.randomUUID();
      toast.success(scheduledAt ? "定时发布任务已创建" : "发布任务已提交");
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "发布提交失败"); }
    finally { setSubmitting(false); }
  }

  async function action(record: PublishRecord, mode: "retry" | "cancel") {
    setSyncingId(record.id);
    try {
      await readApiJson(await fetch(`/api/publish/records/${record.id}/${mode}`, { method: "POST" }));
      if (mode === "retry") setActiveRecordId(record.id);
      toast.success(mode === "retry" ? "已重新进入发布队列" : "发布已取消");
      await load();
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "操作失败"); }
    finally { setSyncingId(null); }
  }

  return (
    <AppShell title="发布中心" description="从已保存版本创建发布记录；素材由浏览器直传 AiToEarn，服务器不转发大文件。" actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" />刷新账号</Button>}>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card><CardHeader><CardTitle>新建发布</CardTitle><CardDescription>发布前请确认正文版本、平台账号、素材和时间。重复点击使用同一幂等键，不会重复创建。</CardDescription></CardHeader><CardContent className="space-y-5">
          {loading ? <div className="h-64 animate-pulse rounded-lg bg-muted" /> : !contents.length ? <div className="rounded-lg border border-dashed p-10 text-center"><p className="font-medium">还没有可发布版本</p><p className="mt-1 text-sm text-muted-foreground">先在创作工作台保存至少一个内容版本。</p></div> : <>
            <label><span className="mb-2 block text-sm font-medium">内容版本</span><select className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={contentId} onChange={(event) => setContentId(event.target.value)}>{contents.map((content) => <option key={content.id} value={content.id}>{content.platform === "douyin" ? "抖音" : "小红书"} · {content.title || "未命名"} · {content._count.revisions} 个版本</option>)}</select></label>
            <label><span className="mb-2 block text-sm font-medium">发布账号</span><select className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">选择账号</option>{matchingAccounts.map((account) => <option key={account.id} value={account.id} disabled={account.status !== "active"}>{account.name}{account.status !== "active" ? "（已过期）" : ""}</option>)}</select>{!matchingAccounts.length ? <p className="mt-2 text-xs text-amber-700">没有可用账号，请先到连接设置完成授权并同步。</p> : null}</label>
            <div><span className="mb-2 block text-sm font-medium">发布素材</span><label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 text-center hover:bg-muted/40"><FileUp className="h-5 w-5 text-muted-foreground" /><span className="mt-2 text-sm font-medium">{selectedContent?.platform === "douyin" ? "选择一个成片视频" : "选择一张或多张图片"}</span><span className="mt-1 text-xs text-muted-foreground">选择后直接上传到供应商签名地址</span><input className="sr-only" type="file" accept={selectedContent?.platform === "douyin" ? "video/*" : "image/*"} multiple={selectedContent?.platform === "xiaohongshu"} onChange={(event) => { Array.from(event.target.files ?? []).forEach((file) => void uploadFile(file)); event.target.value = ""; }} /></label>{uploadProgress != null ? <div className="mt-3"><Progress value={uploadProgress} className="h-2" /><p className="mt-1 text-right font-mono text-xs text-muted-foreground">{uploadProgress}%</p></div> : null}<div className="mt-3 space-y-2">{uploads.map((upload, index) => <div key={`${upload.url}-${index}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span className="min-w-0 truncate">{upload.name} · {(upload.size / 1024 / 1024).toFixed(1)} MB</span><Button variant="ghost" size="icon" onClick={() => setUploads((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-4 w-4" /></Button></div>)}</div></div>
            <label><span className="mb-2 block text-sm font-medium">发布时间（可选）</span><Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)} /></label>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">提交后供应商超时会先查询既有记录，不会盲目再次发布。抖音进入“等待用户确认”时，请使用短链唤起抖音完成最后一步。</div>
            <Button className="w-full" size="lg" disabled={!accountId || !uploads.length || submitting || uploadProgress != null} onClick={() => void submit()}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : scheduledAt ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}{scheduledAt ? "创建定时发布" : "确认并发布"}</Button>
          </>}
        </CardContent></Card>

        <div className="space-y-4"><div><h2 className="font-semibold">最近发布</h2><p className="mt-1 text-sm text-muted-foreground">状态每 2 秒刷新，进入终态后停止轮询。</p></div>{!records.length ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">暂无发布记录</CardContent></Card> : records.map((record) => <RecordCard key={record.id} record={record} busy={syncingId === record.id} onRefresh={() => void refreshRecord(record.id, true)} onRetry={() => void action(record, "retry")} onCancel={() => void action(record, "cancel")} />)}</div>
      </div>
    </AppShell>
  );
}

function RecordCard({ record, busy, onRefresh, onRetry, onCancel }: { record: PublishRecord; busy: boolean; onRefresh: () => void; onRetry: () => void; onCancel: () => void }) {
  return <Card className={cn(record.status === "awaiting_user" && "border-amber-300", record.status === "failed" && "border-red-300")}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate text-base">{record.content?.title || "内容发布"}</CardTitle><CardDescription className="mt-1">{record.platform === "douyin" ? "抖音" : "小红书"} · {new Date(record.createdAt).toLocaleString("zh-CN")}</CardDescription></div><PublishBadge status={record.status} /></div></CardHeader><CardContent className="space-y-3">{record.status === "awaiting_user" ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-medium text-amber-950">还差用户确认</p><p className="mt-1 text-xs leading-5 text-amber-800">请在手机上打开短链并在抖音完成发布确认。</p>{record.shortLink ? <Button className="mt-3 w-full" asChild><a href={record.shortLink} target="_blank" rel="noreferrer">打开抖音确认 <ExternalLink className="h-4 w-4" /></a></Button> : <p className="mt-2 text-xs font-medium text-red-700">供应商暂未返回短链，请刷新状态。</p>}</div> : null}{record.status === "failed" ? <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-900"><CircleAlert className="h-4 w-4 shrink-0" /><span>{record.failureReason || record.failureCode || "发布失败，供应商未返回具体原因。"}</span></div> : null}{record.publicUrl ? <Button variant="outline" className="w-full" asChild><a href={record.publicUrl} target="_blank" rel="noreferrer"><Check className="h-4 w-4" />查看已发布作品</a></Button> : null}<div className="flex gap-2"><Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}刷新</Button>{record.status === "failed" ? <Button size="sm" onClick={onRetry} disabled={busy}><RotateCcw className="h-4 w-4" />重试</Button> : null}{!["published", "canceled", "failed"].includes(record.status) ? <Button variant="ghost" size="sm" className="ml-auto text-red-700" onClick={onCancel} disabled={busy}>取消</Button> : null}</div></CardContent></Card>;
}

function PublishBadge({ status }: { status: RecordStatus }) {
  const map: Record<RecordStatus, { label: string; style: string }> = { draft: { label: "准备中", style: "" }, scheduled: { label: "已定时", style: "border-blue-200 bg-blue-50 text-blue-700" }, uploading: { label: "上传中", style: "border-blue-200 bg-blue-50 text-blue-700" }, submitted: { label: "已提交", style: "border-blue-200 bg-blue-50 text-blue-700" }, awaiting_user: { label: "等待确认", style: "border-amber-200 bg-amber-50 text-amber-700" }, published: { label: "已发布", style: "border-emerald-200 bg-emerald-50 text-emerald-700" }, failed: { label: "失败", style: "border-red-200 bg-red-50 text-red-700" }, canceled: { label: "已取消", style: "" } };
  return <Badge variant="outline" className={map[status].style}>{map[status].label}</Badge>;
}
