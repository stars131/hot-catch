"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BarChart3, CalendarClock, Check, CircleAlert, ExternalLink, FileUp, FlaskConical, Loader2, PlugZap, RefreshCw, RotateCcw, Send, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RecordPerformance } from "@/components/performance/record-performance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { readApiJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useLocale, useTranslations } from "next-intl";
import { GLOBAL_PLATFORM_IDS, type PlatformId } from "@/lib/platforms/registry";

type PublishPlatform = "xiaohongshu" | "douyin";
type Content = { id: string; title: string | null; platform: PlatformId; contentKind: string; status: string; updatedAt: string; _count: { revisions: number; publishRecords: number } };
type Account = { id: string; platform: PublishPlatform; name: string; avatarUrl?: string; status: "active" | "expired" | "invalid" };
type Upload = { name: string; type: "image" | "video"; url: string; size: number };
type RecordStatus = "draft" | "scheduled" | "uploading" | "submitted" | "awaiting_user" | "published" | "failed" | "canceled";
type PublishRecord = { id: string; contentId: string; platform: PublishPlatform; status: RecordStatus; providerAccountId: string; scheduledAt: string | null; submittedAt: string | null; publishedAt: string | null; shortLink: string | null; publicUrl: string | null; failureCode: string | null; failureReason: string | null; attemptCount: number; lastSyncedAt: string | null; createdAt: string; content?: { title: string | null } };
type Signature = { assetId: string; uploadUrl: string; method: "PUT" | "POST"; fields?: Record<string, string>; headers?: Record<string, string>; assetUrl?: string; simulated?: boolean };
type PublishLoadData = {
  contents: Content[];
  accounts: Account[];
  accountsUnavailable: boolean;
  connection: "connected" | "invalid" | "not_configured" | null;
  records: PublishRecord[];
  providerMode: "mock" | "real" | null;
};

const FINAL_STATUSES = new Set<RecordStatus>(["published", "failed", "canceled"]);

export default function PublishPage() {
  return (
    <Suspense fallback={null}>
      <PublishWorkspace />
    </Suspense>
  );
}

function PublishWorkspace() {
  const t = useTranslations("Publish");
  const tp = useTranslations("Platforms");
  const searchParams = useSearchParams();
  /** 创作工作台移交上下文:只用于预选与提示,不代表任何已创建的发布记录 */
  const handoffContentId = searchParams.get("contentId");
  const fromCreator = searchParams.get("from") === "creator";

  const [contents, setContents] = useState<Content[]>([]);
  const [exportOnlyContents, setExportOnlyContents] = useState<Content[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsUnavailable, setAccountsUnavailable] = useState(false);
  const [connection, setConnection] = useState<"connected" | "invalid" | "not_configured" | null>(null);
  const [records, setRecords] = useState<PublishRecord[]>([]);
  const [providerMode, setProviderMode] = useState<"mock" | "real" | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentId, setContentId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [handoffBannerOpen, setHandoffBannerOpen] = useState(true);
  const [handoffMissing, setHandoffMissing] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const queryClient = useQueryClient();

  const applyLoadData = useCallback((data: PublishLoadData) => {
    const allReady = data.contents.filter((content) => content._count.revisions > 0);
    const ready = allReady.filter(
      (content) => content.platform === "xiaohongshu" || content.platform === "douyin",
    );
    setContents(ready);
    setExportOnlyContents(allReady.filter((content) => GLOBAL_PLATFORM_IDS.includes(content.platform)));
    setAccounts(data.accounts);
    setConnection(data.connection);
    setAccountsUnavailable(data.accountsUnavailable);
    setRecords(data.records);
    setProviderMode(data.providerMode);
    const handoffReady = handoffContentId
      ? ready.some((content) => content.id === handoffContentId)
      : false;
    setHandoffMissing(Boolean(handoffContentId) && !handoffReady);
    setContentId((current) => current || (handoffReady ? handoffContentId! : ready[0]?.id || ""));
  }, [handoffContentId]);

  const load = useCallback(async (force = false) => {
    const queryKey = ["workspace", "publish"] as const;
    const cached = queryClient.getQueryData<PublishLoadData>(queryKey);
    if (cached) {
      applyLoadData(cached);
      setLoading(false);
    }
    try {
      const data = await queryClient.fetchQuery({
        queryKey,
        staleTime: force ? 0 : 2 * 60 * 1000,
        queryFn: async (): Promise<PublishLoadData> => {
          let accountsFailed = false;
          const [contentData, statusData, accountData, recordData] = await Promise.all([
            readApiJson<{ contents: Content[] }>(await fetch("/api/content/list", { cache: "no-store" })),
            readApiJson<{ connection: "connected" | "invalid" | "not_configured" }>(await fetch("/api/integrations/aitoearn/status", { cache: "no-store" })).catch(() => null),
            readApiJson<{ accounts: Account[] }>(await fetch("/api/integrations/aitoearn/accounts", { cache: "no-store" })).catch(() => { accountsFailed = true; return { accounts: [] as Account[] }; }),
            readApiJson<{ records: PublishRecord[]; providerMode?: "mock" | "real" }>(await fetch("/api/publish/records", { cache: "no-store" })),
          ]);
          return {
            contents: contentData.contents,
            accounts: accountData.accounts,
            accountsUnavailable: accountsFailed,
            connection: statusData?.connection ?? null,
            records: recordData.records,
            providerMode: recordData.providerMode ?? null,
          };
        },
      });
      applyLoadData(data);
    } catch { toast.error(t("loadFailed")); }
    finally { setLoading(false); }
  }, [applyLoadData, queryClient, t]);

  useEffect(() => { void load(); }, [load]);

  const selectedContent = contents.find((content) => content.id === contentId);
  const matchingAccounts = useMemo(() => accounts.filter((account) => account.platform === selectedContent?.platform), [accounts, selectedContent?.platform]);
  useEffect(() => { setAccountId((current) => matchingAccounts.some((account) => account.id === current) ? current : matchingAccounts[0]?.id ?? ""); setUploads([]); }, [contentId, matchingAccounts]);

  const refreshRecord = useCallback(async (id: string, showToast = false) => {
    setSyncingId(id);
    try {
      const data = await readApiJson<{ record: PublishRecord }>(await fetch(`/api/publish/records/${id}?refresh=1`, { cache: "no-store" }));
      setRecords((current) => [data.record, ...current.filter((item) => item.id !== id)]);
      if (showToast) toast.success(t("statusUpdated"));
      return data.record;
    } catch { if (showToast) toast.error(t("refreshFailed")); return null; }
    finally { setSyncingId(null); }
  }, [t]);

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
    if (!assetType) return toast.error(t("assetTypeError"));
    if (selectedContent.platform === "xiaohongshu" && assetType !== "image") return toast.error(t("xhsImageOnly"));
    if (selectedContent.platform === "douyin" && assetType !== "video") return toast.error(t("douyinVideoOnly"));
    setUploadProgress(10);
    try {
      const signed = await readApiJson<{ upload: Signature }>(await fetch("/api/publish/assets/sign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }) }));
      setUploadProgress(35);
      if (signed.upload.simulated) {
        // 模拟签名：本地状态机验证，绝不向任何地址发送真实文件
      } else if (signed.upload.method === "POST") {
        const body = new FormData();
        Object.entries(signed.upload.fields ?? {}).forEach(([key, value]) => body.append(key, value));
        body.append("file", file);
        const response = await fetch(signed.upload.uploadUrl, { method: "POST", body });
        if (!response.ok) throw new Error(t("directUploadFailed", { status: response.status }));
      } else {
        const response = await fetch(signed.upload.uploadUrl, { method: "PUT", headers: { "content-type": file.type, ...(signed.upload.headers ?? {}) }, body: file });
        if (!response.ok) throw new Error(t("directUploadFailed", { status: response.status }));
      }
      setUploadProgress(80);
      const confirmed = await readApiJson<{ asset: { assetUrl: string } }>(await fetch("/api/publish/assets/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assetId: signed.upload.assetId }) }));
      setUploads((current) => [...current, { name: file.name, type: assetType, url: confirmed.asset.assetUrl || signed.upload.assetUrl || "", size: file.size }]);
      setUploadProgress(100);
      toast.success(signed.upload.simulated ? t("simulatedAsset") : t("assetUploaded"));
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : t("uploadFailed")); }
    finally { window.setTimeout(() => setUploadProgress(null), 600); }
  }

  async function submit() {
    if (!selectedContent || !accountId || !uploads.length) return;
    setSubmitting(true);
    try {
      const data = await readApiJson<{ recordId: string; status: RecordStatus; record?: PublishRecord; providerMode?: "mock" | "real" }>(await fetch("/api/publish/flows", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey.current }, body: JSON.stringify({ contentId: selectedContent.id, accountId, ...(scheduledAt ? { scheduledAt: new Date(scheduledAt).toISOString() } : {}), assets: uploads.map(({ url, type }) => ({ url, type })) }) }));
      setActiveRecordId(data.recordId);
      if (data.record) setRecords((current) => [data.record!, ...current.filter((item) => item.id !== data.record!.id)]);
      idempotencyKey.current = crypto.randomUUID();
      toast.success(data.providerMode === "mock" ? t("mockSubmitted") : scheduledAt ? t("scheduledCreated") : t("submitted"));
      await load(true);
    } catch { toast.error(t("submitFailed")); }
    finally { setSubmitting(false); }
  }

  async function action(record: PublishRecord, mode: "retry" | "cancel") {
    setSyncingId(record.id);
    try {
      await readApiJson(await fetch(`/api/publish/records/${record.id}/${mode}`, { method: "POST" }));
      if (mode === "retry") setActiveRecordId(record.id);
      toast.success(mode === "retry" ? t("requeued") : t("canceledToast"));
      await load(true);
    } catch { toast.error(t("actionFailed")); }
    finally { setSyncingId(null); }
  }

  return (
    <AppShell title={t("title")} description={t("description")} actions={<Button variant="outline" size="sm" onClick={() => void load(true)}><RefreshCw className="h-4 w-4" />{t("refreshAccounts")}</Button>}>
      {exportOnlyContents.length ? (
        <Card className="mb-5 border-violet-200 bg-violet-50/60" data-testid="foreign-export-only">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">{t("exportOnlyTitle")}</CardTitle>
                <CardDescription className="mt-1 max-w-3xl">{t("exportOnlyBody")}</CardDescription>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/creator">{t("goCreator")}</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="outline">{t("exportCount", { count: exportOnlyContents.length })}</Badge>
            {exportOnlyContents.map((content) => (
              <Badge key={content.id} variant="secondary">
                {tp(content.platform)} · {content.title || "—"}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {providerMode === "mock" ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-4" data-testid="publish-mock-banner" role="status">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
          <div className="min-w-0 flex-1 text-sm leading-6 text-sky-950">
            <p className="font-medium">{t("mockModeTitle")}</p>
            <p className="mt-0.5 text-xs leading-5 text-sky-800">{t("mockModeBody")}</p>
          </div>
        </div>
      ) : null}
      {fromCreator && handoffBannerOpen ? (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid="publish-handoff-banner" role="status">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          <div className="min-w-0 flex-1 text-sm leading-6 text-emerald-950">
            <p className="font-medium">{t("handoffTitle")}</p>
            <p className="mt-0.5 text-xs leading-5 text-emerald-800">{t("handoffBody")}</p>
            {handoffMissing ? <p className="mt-1 text-xs font-medium text-amber-800" data-testid="publish-handoff-missing">{t("handoffMissing")}</p> : null}
          </div>
          <button type="button" className="shrink-0 text-emerald-700 hover:text-emerald-900" aria-label={t("closeHandoff")} onClick={() => setHandoffBannerOpen(false)}><X className="h-4 w-4" /></button>
        </div>
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card><CardHeader><CardTitle>{t("newPublish")}</CardTitle><CardDescription>{t("newPublishDescription")}</CardDescription></CardHeader><CardContent className="space-y-5">
          {loading ? <div className="h-64 animate-pulse rounded-lg bg-muted" /> : !contents.length ? <div className="rounded-lg border border-dashed p-10 text-center"><p className="font-medium">{t("noPublishableTitle")}</p><p className="mt-1 text-sm text-muted-foreground">{t("noPublishableBody")}</p></div> : <>
            <label><span className="mb-2 block text-sm font-medium">{t("contentVersion")}</span><select className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={contentId} onChange={(event) => setContentId(event.target.value)}>{contents.map((content) => <option key={content.id} value={content.id}>{content.platform === "douyin" ? tp("douyin") : tp("xiaohongshu")} · {content.title || t("untitled")} · {t("revisionCount", { count: content._count.revisions })}</option>)}</select></label>
            <label><span className="mb-2 block text-sm font-medium">{t("publishAccount")}</span><select className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">{t("selectAccount")}</option>{matchingAccounts.map((account) => <option key={account.id} value={account.id} disabled={account.status !== "active"}>{account.name}{account.status !== "active" ? t("expiredSuffix") : ""}</option>)}</select>{accountsUnavailable ? <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="publish-connection-required"><PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div className="min-w-0 text-xs leading-5 text-amber-900"><p className="font-medium">{connection === "not_configured" ? t("connectionMissingTitle") : connection === "invalid" ? t("connectionInvalidTitle") : t("connectionUnavailableTitle")}</p><p className="mt-0.5">{connection === "not_configured" ? t("connectionMissingBody") : connection === "invalid" ? t("connectionInvalidBody") : t("connectionUnavailableBody")}</p><Button asChild size="sm" variant="outline" className="mt-2"><Link href="/settings/connections">{t("goConnections")}</Link></Button></div></div> : !matchingAccounts.length ? <p className="mt-2 text-xs text-amber-700">{t("noAccountPrefix")}<Link className="underline underline-offset-2" href="/settings/connections">{t("connectionsLink")}</Link>{t("noAccountSuffix")}</p> : null}</label>
            <div><span className="mb-2 block text-sm font-medium">{t("publishAssets")}</span><label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-4 text-center hover:bg-muted/40"><FileUp className="h-5 w-5 text-muted-foreground" /><span className="mt-2 text-sm font-medium">{selectedContent?.platform === "douyin" ? t("chooseVideo") : t("chooseImages")}</span><span className="mt-1 text-xs text-muted-foreground">{t("uploadHelp")}</span><input className="sr-only" type="file" accept={selectedContent?.platform === "douyin" ? "video/*" : "image/*"} multiple={selectedContent?.platform === "xiaohongshu"} onChange={(event) => { Array.from(event.target.files ?? []).forEach((file) => void uploadFile(file)); event.target.value = ""; }} /></label>{uploadProgress != null ? <div className="mt-3"><Progress value={uploadProgress} className="h-2" /><p className="mt-1 text-right font-mono text-xs text-muted-foreground">{uploadProgress}%</p></div> : null}<div className="mt-3 space-y-2">{uploads.map((upload, index) => <div key={`${upload.url}-${index}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span className="min-w-0 truncate">{upload.name} · {(upload.size / 1024 / 1024).toFixed(1)} MB</span><Button aria-label={t("removeAsset")} variant="ghost" size="icon" onClick={() => setUploads((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X className="h-4 w-4" /></Button></div>)}</div></div>
            <label><span className="mb-2 block text-sm font-medium">{t("publishTime")}</span><Input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} min={new Date(Date.now() + 5 * 60_000).toISOString().slice(0, 16)} /></label>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{t("idempotencyNotice")}</div>
            <Button className="w-full" size="lg" disabled={!accountId || !uploads.length || submitting || uploadProgress != null} onClick={() => void submit()}>{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : scheduledAt ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}{scheduledAt ? t("createScheduled") : t("confirmPublish")}</Button>
          </>}
        </CardContent></Card>

        <div className="min-w-0 space-y-4"><div><h2 className="font-semibold">{t("recentPublishes")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("recentPublishesHelp")}</p></div>{!records.length ? <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">{t("noPublishRecords")}</CardContent></Card> : records.map((record) => <RecordCard key={record.id} record={record} busy={syncingId === record.id} onRefresh={() => void refreshRecord(record.id, true)} onRetry={() => void action(record, "retry")} onCancel={() => void action(record, "cancel")} />)}</div>
      </div>
    </AppShell>
  );
}

function RecordCard({ record, busy, onRefresh, onRetry, onCancel }: { record: PublishRecord; busy: boolean; onRefresh: () => void; onRetry: () => void; onCancel: () => void }) {
  const t = useTranslations("Publish");
  const tp = useTranslations("Platforms");
  const locale = useLocale();
  const [showPerformance, setShowPerformance] = useState(false);
  return <Card data-testid={`publish-record-${record.id}`} className={cn(record.status === "awaiting_user" && "border-amber-300", record.status === "failed" && "border-red-300")}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><CardTitle className="truncate text-base">{record.content?.title || t("publishContent")}</CardTitle><CardDescription className="mt-1">{record.platform === "douyin" ? tp("douyin") : tp("xiaohongshu")} · {new Date(record.createdAt).toLocaleString(locale)}</CardDescription></div><PublishBadge status={record.status} /></div></CardHeader><CardContent className="space-y-3">{record.status === "awaiting_user" ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-sm font-medium text-amber-950">{t("awaitingUserTitle")}</p><p className="mt-1 text-xs leading-5 text-amber-800">{t("awaitingUserBody")}</p>{record.shortLink ? <Button className="mt-3 w-full" asChild><a href={record.shortLink} target="_blank" rel="noreferrer">{t("openDouyin")} <ExternalLink className="h-4 w-4" /></a></Button> : <p className="mt-2 text-xs font-medium text-red-700">{t("shortLinkMissing")}</p>}</div> : null}{record.status === "failed" ? <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-900"><CircleAlert className="h-4 w-4 shrink-0" /><span>{record.failureCode ? t("publishFailedSafe", { code: record.failureCode }) : t("publishFailedUnknown")}</span></div> : null}{record.publicUrl ? <Button variant="outline" className="w-full" asChild><a href={record.publicUrl} target="_blank" rel="noreferrer"><Check className="h-4 w-4" />{t("viewPublished")}</a></Button> : null}{showPerformance ? <RecordPerformance contentId={record.contentId} recordId={record.id} /> : null}<div className="flex gap-2"><Button variant="outline" size="sm" onClick={onRefresh} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t("refresh")}</Button><Button variant="outline" size="sm" data-testid={`performance-toggle-${record.id}`} onClick={() => setShowPerformance((open) => !open)}><BarChart3 className="h-4 w-4" />{showPerformance ? t("hidePerformance") : t("performance")}</Button>{record.status === "failed" ? <Button size="sm" onClick={onRetry} disabled={busy}><RotateCcw className="h-4 w-4" />{t("retry")}</Button> : null}{!["published", "canceled", "failed"].includes(record.status) ? <Button variant="ghost" size="sm" className="ml-auto text-red-700" onClick={onCancel} disabled={busy}>{t("cancel")}</Button> : null}</div></CardContent></Card>;
}

function PublishBadge({ status }: { status: RecordStatus }) {
  const t = useTranslations("Publish.status");
  const map: Record<RecordStatus, { label: string; style: string }> = { draft: { label: t("draft"), style: "" }, scheduled: { label: t("scheduled"), style: "border-blue-200 bg-blue-50 text-blue-700" }, uploading: { label: t("uploading"), style: "border-blue-200 bg-blue-50 text-blue-700" }, submitted: { label: t("submitted"), style: "border-blue-200 bg-blue-50 text-blue-700" }, awaiting_user: { label: t("awaiting_user"), style: "border-amber-200 bg-amber-50 text-amber-700" }, published: { label: t("published"), style: "border-emerald-200 bg-emerald-50 text-emerald-700" }, failed: { label: t("failed"), style: "border-red-200 bg-red-50 text-red-700" }, canceled: { label: t("canceled"), style: "" } };
  return <Badge variant="outline" className={map[status].style}>{map[status].label}</Badge>;
}
