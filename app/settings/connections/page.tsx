"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, KeyRound, Link2, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { readApiJson } from "@/lib/api-client";

type Provider = "tikhub" | "qwen_asr" | "aitoearn" | "deepseek" | "firecrawl" | "xiaohongshu_cookie";
type Summary = { provider: Provider; configured: boolean; status: "active" | "invalid" | "revoked" | "missing"; keyHint: string | null; lastValidatedAt: string | null; updatedAt: string | null };
type AiToEarnStatus = { connection: "connected" | "invalid" | "not_configured"; keyHint: string | null; metadata: { platforms: Array<{ platform: string; displayName: string; notes?: string }> } };
type PublishAccount = { id: string; platform: string; name: string; status: "active" | "expired" | "invalid" };

const PROVIDERS: Array<{ provider: Exclude<Provider, "xiaohongshu_cookie">; name: string; purpose: string; placeholder: string; baseUrl?: string; optional?: string }> = [
  { provider: "deepseek", name: "DeepSeek", purpose: "内容生成、风格分析和结构化复盘", placeholder: "sk-...", baseUrl: "https://api.deepseek.com" },
  { provider: "tikhub", name: "TikHub", purpose: "小红书与抖音公开/授权账号、作品和指标解析", placeholder: "TikHub API Key" },
  { provider: "qwen_asr", name: "Qwen-ASR", purpose: "抖音视频语音转写", placeholder: "DashScope API Key", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", optional: "workspaceId" },
  { provider: "aitoearn", name: "AiToEarn", purpose: "平台授权、素材上传、发布与记录回收", placeholder: "AiToEarn API Key", baseUrl: "https://open-api.aitoearn.cn" },
  { provider: "firecrawl", name: "Firecrawl", purpose: "可选：导入普通网页资料", placeholder: "fc-...", baseUrl: "https://api.firecrawl.dev" },
];

export default function ConnectionsPage() {
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [busy, setBusy] = useState<Provider | null>(null);
  const [forms, setForms] = useState<Record<string, { apiKey: string; baseUrl: string; workspaceId: string }>>({});
  const [authBusy, setAuthBusy] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiToEarnStatus | null>(null);
  const [accounts, setAccounts] = useState<PublishAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await readApiJson<{ credentials: Summary[] }>(await fetch("/api/settings/credentials", { cache: "no-store" }));
      setSummaries(data.credentials);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "连接状态加载失败"); }
    finally { setLoading(false); }
    try {
      setAiStatus(await readApiJson<AiToEarnStatus>(await fetch("/api/integrations/aitoearn/status", { cache: "no-store" })));
    } catch { setAiStatus(null); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function summary(provider: Provider) { return summaries.find((item) => item.provider === provider); }
  function form(provider: Provider) { return forms[provider] ?? { apiKey: "", baseUrl: "", workspaceId: "" }; }
  function update(provider: Provider, key: "apiKey" | "baseUrl" | "workspaceId", value: string) { setForms((current) => ({ ...current, [provider]: { ...form(provider), [key]: value } })); }

  async function save(provider: Provider) {
    const value = Object.fromEntries(Object.entries(form(provider)).filter(([, entry]) => entry.trim()));
    if (!value.apiKey) return toast.error("请填写 API Key");
    setBusy(provider);
    try {
      const data = await readApiJson<{ credential: Omit<Summary, "configured" | "lastValidatedAt"> }>(await fetch("/api/settings/credentials", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, value }) }));
      setForms((current) => ({ ...current, [provider]: { apiKey: "", baseUrl: "", workspaceId: "" } }));
      setEditing(null);
      toast.success(`${PROVIDERS.find((item) => item.provider === provider)?.name ?? provider} 已加密保存`);
      await load();
      if (data.credential.provider === "aitoearn") toast.message("下一步授权发布账号", { description: "API Key 保存后，还需要分别授权小红书和抖音账号。" });
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setBusy(null); }
  }

  async function remove(provider: Provider) {
    setBusy(provider);
    try { await readApiJson(await fetch(`/api/settings/credentials?provider=${provider}`, { method: "DELETE" })); setEditing(null); toast.success("凭证已删除"); await load(); }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "删除失败"); }
    finally { setBusy(null); }
  }

  async function authorize(platform: "xiaohongshu" | "douyin") {
    setAuthBusy(platform);
    try {
      const data = await readApiJson<{ authorizationUrl: string; sessionId: string }>(await fetch("/api/integrations/aitoearn/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform }) }));
      sessionStorage.setItem(`aitoearn-auth-${platform}`, data.sessionId);
      window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
      toast.success("授权页已打开", { description: "完成授权后回到这里检查账号状态。" });
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "无法开始授权"); }
    finally { setAuthBusy(null); }
  }

  async function checkAccounts() {
    setAuthBusy("accounts");
    setAccountsError(null);
    try {
      const data = await readApiJson<{ accounts: PublishAccount[] }>(await fetch("/api/integrations/aitoearn/accounts", { cache: "no-store" }));
      setAccounts(data.accounts);
      if (!data.accounts.length) toast.message("暂未同步到发布账号");
      else toast.success(`已同步 ${data.accounts.length} 个账号`);
    } catch (cause) {
      setAccounts(null);
      setAccountsError(cause instanceof Error ? cause.message : "账号同步失败");
      toast.error(cause instanceof Error ? cause.message : "账号同步失败");
    }
    finally { setAuthBusy(null); }
  }

  return (
    <AppShell title="连接设置" description="每位用户独立提供供应商凭证；保存后只显示脱敏提示，不再返回原文。">
      <div className="space-y-5">
        <Card className="border-emerald-200 bg-emerald-50/50"><CardContent className="flex items-start gap-3 p-4"><ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" /><div><p className="text-sm font-medium text-emerald-950">凭证使用 AES-256-GCM 加密存储</p><p className="mt-1 text-xs leading-5 text-emerald-800">浏览器、API 响应和应用日志不会返回 Key 原文。生产部署前必须单独配置 CREDENTIAL_ENCRYPTION_KEY。</p></div></CardContent></Card>
        {loading ? <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-48 animate-pulse rounded-xl bg-muted" />)}</div> : <div className="grid gap-4 lg:grid-cols-2">{PROVIDERS.map((item) => { const state = summary(item.provider); const isEditing = editing === item.provider; return <Card key={item.provider}><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4" />{item.name}</CardTitle><CardDescription className="mt-2">{item.purpose}</CardDescription></div><ConnectionBadge state={state} /></div></CardHeader><CardContent>{state?.configured && !isEditing ? <div className="space-y-4"><div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">已保存凭证</p><p className="mt-1 font-mono text-sm">{state.keyHint ?? "••••••••"}</p><p className="mt-1 text-[11px] text-muted-foreground">更新于 {state.updatedAt ? new Date(state.updatedAt).toLocaleString("zh-CN") : "—"}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setEditing(item.provider)}>替换凭证</Button><Button variant="ghost" className="text-red-700" onClick={() => void remove(item.provider)} disabled={busy === item.provider}><Trash2 className="h-4 w-4" />删除</Button></div></div> : <div className="space-y-3"><label><span className="mb-1.5 block text-xs font-medium">API Key</span><Input type="password" autoComplete="new-password" value={form(item.provider).apiKey} onChange={(event) => update(item.provider, "apiKey", event.target.value)} placeholder={item.placeholder} /></label>{item.baseUrl ? <label><span className="mb-1.5 block text-xs font-medium">服务地址（可选）</span><Input value={form(item.provider).baseUrl} onChange={(event) => update(item.provider, "baseUrl", event.target.value)} placeholder={item.baseUrl} /></label> : null}{item.optional ? <label><span className="mb-1.5 block text-xs font-medium">Workspace ID（可选）</span><Input value={form(item.provider).workspaceId} onChange={(event) => update(item.provider, "workspaceId", event.target.value)} /></label> : null}<div className="flex justify-end gap-2 pt-1">{state?.configured ? <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button> : null}<Button onClick={() => void save(item.provider)} disabled={busy === item.provider}>{busy === item.provider ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}加密保存</Button></div></div>}</CardContent></Card>; })}</div>}
        <Card><CardHeader><div className="flex items-start justify-between gap-4"><div><CardTitle>发布账号授权（AiToEarn）</CardTitle><CardDescription>先保存 AiToEarn API Key，再分别授权平台账号。每位用户只能看到自己的授权账号。</CardDescription></div><AiToEarnConnectionBadge connection={aiStatus?.connection} /></div></CardHeader><CardContent className="space-y-4">
          {aiStatus?.connection === "not_configured" || (!loading && !summary("aitoearn")?.configured) ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900" data-testid="aitoearn-not-configured">
              <p className="font-medium">连接未配置</p>
              <p className="mt-0.5">尚未保存 AiToEarn API Key。发布账号授权、素材直传与发布提交都需要先完成连接；系统不会用模拟数据代替。请在上方 AiToEarn 卡片中加密保存 API Key。</p>
            </div>
          ) : aiStatus?.connection === "invalid" ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-900" data-testid="aitoearn-invalid">
              <p className="font-medium">凭证已失效或被撤销</p>
              <p className="mt-0.5">请在上方 AiToEarn 卡片替换凭证后重试授权。</p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void authorize("xiaohongshu")} disabled={aiStatus?.connection !== "connected" || authBusy != null}>{authBusy === "xiaohongshu" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}授权小红书</Button><Button variant="outline" onClick={() => void authorize("douyin")} disabled={aiStatus?.connection !== "connected" || authBusy != null}>{authBusy === "douyin" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}授权抖音</Button><Button onClick={() => void checkAccounts()} disabled={aiStatus?.connection !== "connected" || authBusy != null}>{authBusy === "accounts" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}同步账号状态</Button></div>
          <div data-testid="aitoearn-accounts">
            <p className="text-sm font-medium">已授权账号</p>
            {accountsError ? <p className="mt-2 text-xs text-red-700">{accountsError}</p>
              : accounts === null ? <p className="mt-2 text-xs text-muted-foreground">{aiStatus?.connection === "connected" ? "点击「同步账号状态」查看当前授权的发布账号。" : "完成连接后可在这里查看授权账号。"}</p>
              : !accounts.length ? <p className="mt-2 text-xs text-muted-foreground">暂无授权账号，请先完成平台授权。</p>
              : <ul className="mt-2 space-y-2">{accounts.map((account) => <li key={account.id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"><span className="min-w-0 truncate">{account.name}<span className="ml-2 text-xs text-muted-foreground">{account.platform === "douyin" ? "抖音" : "小红书"}</span></span><Badge variant="outline" className={account.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}>{account.status === "active" ? "有效" : "已过期"}</Badge></li>)}</ul>}
          </div>
          {aiStatus ? <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground"><p className="font-medium text-foreground">平台发布规则（本地约束，实际以供应商为准）</p><ul className="mt-1 list-disc pl-4">{aiStatus.metadata.platforms.map((rules) => <li key={rules.platform}>{rules.displayName}：{rules.notes ?? ""}</li>)}</ul></div> : null}
        </CardContent></Card>
        <Card><CardHeader><CardTitle>小红书热点 Cookie</CardTitle><CardDescription>只允许用于本地开发和用户本人可访问的来源。</CardDescription></CardHeader><CardContent><p className="text-sm text-muted-foreground">开发环境请在“热点研究 → 来源连接”里配置；生产环境必须迁移为用户级加密凭证，不能使用服务器本地 JSON。</p></CardContent></Card>
      </div>
    </AppShell>
  );
}

function ConnectionBadge({ state }: { state?: Summary }) {
  if (!state?.configured) return <Badge variant="outline">未配置</Badge>;
  if (state.status === "active") return <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"><Check className="mr-1 h-3 w-3" />已连接</Badge>;
  return <Badge className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-50">{state.status === "invalid" ? "凭证失效" : "已撤销"}</Badge>;
}

function AiToEarnConnectionBadge({ connection }: { connection?: AiToEarnStatus["connection"] }) {
  if (connection === "connected") return <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50" data-testid="aitoearn-connection-badge"><Check className="mr-1 h-3 w-3" />已连接</Badge>;
  if (connection === "invalid") return <Badge className="border border-red-200 bg-red-50 text-red-700 hover:bg-red-50" data-testid="aitoearn-connection-badge">凭证失效</Badge>;
  return <Badge variant="outline" data-testid="aitoearn-connection-badge">未配置</Badge>;
}
