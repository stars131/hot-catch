"use client";

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, PencilLine, Plus, RefreshCw, Search, UserRound } from "lucide-react";
import { toast } from "sonner";
import { PersonaConversationDialog } from "@/components/personas/persona-conversation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PLATFORM_DEFINITIONS, PLATFORM_IDS, type PlatformId } from "@/lib/platforms/registry";
import type { PersonaDraft } from "@/lib/personas/conversation";

type Persona = Record<string, unknown> & { id: string; name: string | null; version: number; status: "draft" | "active" | "archived"; updatedAt: string; socialConnectionId: string | null };
type Memory = { id: string; title: string; body: string; kind: string; status: "candidate" | "approved" | "rejected" | "archived"; confidence: number; updatedAt: string };
type Connection = { id: string; platform: PlatformId; displayName: string | null; handle: string | null; source: "authorized" | "manual"; status: string; isDefault: boolean; personas: Persona[]; contents: Array<{ id: string; title: string | null; status: string; updatedAt: string }>; _count: { contents: number; memories: number } };

export default function PersonasPage() {
  const [selectedId, setSelectedId] = useState<string>("global");
  const [personaOpen, setPersonaOpen] = useState(false);
  const [personaSeed, setPersonaSeed] = useState<Persona | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [memoryQuery, setMemoryQuery] = useState("");
  const deferredMemoryQuery = useDeferredValue(memoryQuery);
  const queryClient = useQueryClient();
  const accountParam = selectedId === "global" ? "global" : selectedId;
  const connectionsQuery = useQuery({
    queryKey: ["workspace", "social-connections"],
    queryFn: async () => {
      const response = await fetch("/api/social-connections", { cache: "no-store" });
      if (!response.ok) throw new Error("加载账号失败");
      return response.json() as Promise<{ connections: Connection[] }>;
    },
    staleTime: 3 * 60 * 1000,
  });
  const personasQuery = useQuery({
    queryKey: ["workspace", "personas", accountParam],
    queryFn: async () => {
      const response = await fetch(`/api/personas?socialConnectionId=${encodeURIComponent(accountParam)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("加载人设失败");
      return response.json() as Promise<{ personas: Persona[] }>;
    },
    staleTime: 2 * 60 * 1000,
  });
  const memoriesQuery = useQuery({
    queryKey: ["workspace", "memories", accountParam, deferredMemoryQuery],
    queryFn: async () => {
      const response = await fetch(`/api/memories?socialConnectionId=${encodeURIComponent(accountParam)}&q=${encodeURIComponent(deferredMemoryQuery)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("加载记忆失败");
      return response.json() as Promise<{ memories: Memory[] }>;
    },
    staleTime: 60 * 1000,
  });
  const connections = connectionsQuery.data?.connections ?? [];
  const personas = personasQuery.data?.personas ?? [];
  const memories = memoriesQuery.data?.memories ?? [];
  const loading = connectionsQuery.isPending || personasQuery.isPending || memoriesQuery.isPending;
  const selected = connections.find((connection) => connection.id === selectedId) ?? null;
  const activePersona = personas.find((persona) => persona.status === "active") ?? null;

  const load = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace", "social-connections"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace", "personas"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace", "memories"] }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    const error = connectionsQuery.error ?? personasQuery.error ?? memoriesQuery.error;
    if (error) toast.error(error instanceof Error ? error.message : "加载失败");
  }, [connectionsQuery.error, memoriesQuery.error, personasQuery.error]);

  function openPersonaConversation(seed: Persona | null = activePersona) {
    setPersonaSeed(seed);
    setPersonaOpen(true);
  }

  async function savePersona(draft: PersonaDraft, status: "draft" | "active") {
    const response = await fetch("/api/personas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        socialConnectionId: selectedId === "global" ? null : selectedId,
        previousVersionId: personaSeed?.id ?? activePersona?.id,
        status,
        source: "manual",
        isDefault: selectedId === "global" && status === "active",
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(error?.error || "保存人设失败");
    }
    toast.success(status === "active" ? "新版本已激活" : "人设草稿已保存");
    await load();
  }

  async function personaAction(action: "activate" | "archive", personaId: string) {
    if (action === "archive" && !window.confirm("确认归档这个人设版本？历史作品不会改变。")) return;
    const response = await fetch("/api/personas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, personaId }) });
    if (!response.ok) return toast.error("操作失败");
    toast.success(action === "activate" ? "人设版本已激活" : "版本已归档"); await load();
  }

  async function memoryAction(action: "accept" | "reject" | "archive", memoryId: string) {
    const response = await fetch("/api/memories", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, memoryId }) });
    if (!response.ok) return toast.error("记忆审核失败");
    await load();
  }

  async function syncAccounts() {
    const response = await fetch("/api/social-connections/sync", { method: "POST" });
    if (!response.ok) return toast.error("同步授权账号失败");
    toast.success("授权账号已同步"); await load();
  }

  async function archiveAccount() {
    if (!selected || !window.confirm(`确认归档账号“${selected.displayName ?? selected.handle ?? "未命名"}”？人设与历史作品仍会保留。`)) return;
    const response = await fetch("/api/social-connections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive", id: selected.id }) });
    if (!response.ok) return toast.error("归档账号失败");
    setSelectedId("global"); toast.success("账号已归档"); await load();
  }

  return (
    <main className="min-h-dvh pb-24 lg:pb-8">
      <header className="flex flex-col gap-3 border-b px-4 py-4 sm:px-6 md:flex-row md:items-center lg:px-8">
        <div className="w-full min-w-0 md:flex-1">
          <h1 className="text-xl font-semibold">账号人设</h1>
          <p className="text-sm text-muted-foreground">按账号管理人设版本、创作记忆和关联作品。</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto md:shrink-0">
          <Button className="flex-1 md:flex-none" variant="outline" onClick={() => void syncAccounts()}><RefreshCw data-icon="inline-start" />同步授权账号</Button>
          <Button className="flex-1 md:flex-none" onClick={() => setAccountOpen(true)}><Plus data-icon="inline-start" />手动添加账号</Button>
        </div>
      </header>

      <div className="grid min-h-[calc(100dvh-82px)] lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-b bg-muted/20 p-3 lg:border-b-0 lg:border-r">
          <AccountButton active={selectedId === "global"} title="全局人设" meta="未指定账号时使用" onClick={() => setSelectedId("global")} />
          <div className="mt-3 flex flex-col gap-1">
            {connections.map((connection) => (
              <AccountButton key={connection.id} active={selectedId === connection.id} title={connection.displayName || connection.handle || "未命名账号"} meta={`${PLATFORM_DEFINITIONS[connection.platform].displayName} · ${connection.source === "authorized" ? "已授权" : "手动"}`} onClick={() => setSelectedId(connection.id)} />
            ))}
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8">
          {loading ? <PersonaSkeleton /> : (
            <>
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex size-12 items-center justify-center rounded-md bg-primary/10 text-primary"><UserRound /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{selected?.displayName || selected?.handle || "全局人设"}</h2>
                    {selected ? <Badge variant={selected.status === "active" ? "secondary" : "outline"}>{selected.status}</Badge> : <Badge variant="secondary">默认回退</Badge>}
                    {activePersona ? <Badge>生效 v{activePersona.version}</Badge> : <Badge variant="outline">尚未配置</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{activePersona?.name || "创建首个人设版本后，创作会自动使用它。"}</p>
                </div>
                {selected ? <Button variant="outline" size="icon" title="归档账号" onClick={() => void archiveAccount()}><Archive /></Button> : null}
                <Button onClick={() => openPersonaConversation()}><Plus data-icon="inline-start" />对话新建版本</Button>
              </div>

              <Tabs defaultValue="persona" className="mt-6">
                <TabsList><TabsTrigger value="persona">生效人设</TabsTrigger><TabsTrigger value="versions">版本</TabsTrigger><TabsTrigger value="memories">记忆</TabsTrigger><TabsTrigger value="contents">作品</TabsTrigger></TabsList>
                <TabsContent value="persona" className="mt-6"><PersonaOverview persona={activePersona} onEdit={() => openPersonaConversation(activePersona)} /></TabsContent>
                <TabsContent value="versions" className="mt-6"><VersionList personas={personas} onAction={personaAction} onEdit={openPersonaConversation} /></TabsContent>
                <TabsContent value="memories" className="mt-6">
                  <div className="mb-4 flex max-w-md items-center gap-2"><Search className="h-4 w-4 text-muted-foreground" /><Input value={memoryQuery} onChange={(event) => setMemoryQuery(event.target.value)} placeholder="搜索记忆" /></div>
                  <MemoryList memories={memories} onAction={memoryAction} />
                </TabsContent>
                <TabsContent value="contents" className="mt-6"><ContentList contents={selected?.contents ?? []} /></TabsContent>
              </Tabs>
            </>
          )}
        </section>
      </div>

      <PersonaConversationDialog
        open={personaOpen}
        onOpenChange={setPersonaOpen}
        seed={personaSeed}
        accountName={selected?.displayName || selected?.handle || ""}
        onSave={savePersona}
      />
      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} onSaved={async (id) => { await load(); setSelectedId(id); }} />
    </main>
  );
}

function AccountButton(props: { active: boolean; title: string; meta: string; onClick: () => void }) {
  return <button type="button" onClick={props.onClick} aria-current={props.active ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left ${props.active ? "bg-background shadow-sm" : "hover:bg-background/70"}`}><span className="flex size-8 items-center justify-center rounded-md bg-muted"><UserRound className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium">{props.title}</span><span className="block truncate text-xs text-muted-foreground">{props.meta}</span></span></button>;
}

function PersonaOverview({ persona, onEdit }: { persona: Persona | null; onEdit: () => void }) {
  if (!persona) return <EmptyText text="尚未创建生效人设。" />;
  const fields = [["定位", persona.niche], ["身份", persona.creatorIdentity], ["目标受众", persona.targetAudience], ["表达风格", persona.contentStyle], ["持续选题", persona.sustainableTopics], ["表达边界", persona.expressionBoundary], ["禁区", persona.forbiddenTopics], ["商业目标", persona.businessGoal], ["常用表达", persona.commonPhrases]];
  return <div><div className="mb-5 flex justify-end"><Button variant="outline" onClick={onEdit}><PencilLine data-icon="inline-start" />对话修改</Button></div><dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">{fields.map(([label, value]) => <div key={String(label)}><dt className="text-xs font-medium text-muted-foreground">{String(label)}</dt><dd className="mt-1 whitespace-pre-wrap text-sm leading-6">{String(value || "未设置")}</dd></div>)}</dl></div>;
}

function VersionList({ personas, onAction, onEdit }: { personas: Persona[]; onAction: (action: "activate" | "archive", id: string) => void; onEdit: (persona: Persona) => void }) {
  if (!personas.length) return <EmptyText text="暂无人设版本。" />;
  return <div className="flex flex-col divide-y">{personas.map((persona) => <div key={persona.id} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-medium">v{persona.version} · {persona.name || "未命名"}</span><Badge variant={persona.status === "active" ? "default" : "outline"}>{persona.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{new Date(persona.updatedAt).toLocaleString()}</p></div>{persona.status !== "active" ? <Button size="sm" variant="outline" onClick={() => onAction("activate", persona.id)}><Check data-icon="inline-start" />激活</Button> : null}<Button size="sm" variant="ghost" onClick={() => onEdit(persona)}><PencilLine data-icon="inline-start" />基于此版修改</Button>{persona.status !== "archived" ? <Button size="sm" variant="ghost" onClick={() => onAction("archive", persona.id)}><Archive data-icon="inline-start" />归档</Button> : null}</div>)}</div>;
}

function MemoryList({ memories, onAction }: { memories: Memory[]; onAction: (action: "accept" | "reject" | "archive", id: string) => void }) {
  if (!memories.length) return <EmptyText text="暂无记忆。有效创作和复盘会在这里产生候选。" />;
  return <div className="flex flex-col divide-y">{memories.map((memory) => <div key={memory.id} className="py-4"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{memory.title}</span><Badge variant={memory.status === "approved" ? "default" : "outline"}>{memory.status}</Badge><Badge variant="secondary">{memory.kind}</Badge><span className="text-xs text-muted-foreground">置信度 {Math.round(memory.confidence * 100)}%</span></div><p className="mt-2 text-sm leading-6">{memory.body}</p>{memory.status === "candidate" ? <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => onAction("accept", memory.id)}>接受</Button><Button size="sm" variant="outline" onClick={() => onAction("reject", memory.id)}>拒绝</Button></div> : memory.status === "approved" ? <Button className="mt-3" size="sm" variant="ghost" onClick={() => onAction("archive", memory.id)}>归档</Button> : null}</div>)}</div>;
}

function ContentList({ contents }: { contents: Connection["contents"] }) {
  if (!contents.length) return <EmptyText text="该账号尚无关联作品。" />;
  return <div className="flex flex-col divide-y">{contents.map((content) => <a key={content.id} href={`/creator?contentId=${content.id}`} className="flex items-center gap-3 py-4 hover:text-primary"><span className="min-w-0 flex-1 truncate text-sm font-medium">{content.title || "未命名作品"}</span><Badge variant="outline">{content.status}</Badge><span className="text-xs text-muted-foreground">{new Date(content.updatedAt).toLocaleDateString()}</span></a>)}</div>;
}

function AccountDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: (id: string) => void }) {
  const [platform, setPlatform] = useState<PlatformId>("xiaohongshu"); const [name, setName] = useState(""); const [handle, setHandle] = useState("");
  async function save() { const response = await fetch("/api/social-connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform, displayName: name, handle }) }); if (!response.ok) return toast.error("添加账号失败"); const data = await response.json(); props.onOpenChange(false); setName(""); setHandle(""); toast.success("账号已添加"); await props.onSaved(data.connection.id); }
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}><DialogContent><DialogHeader><DialogTitle>手动添加账号</DialogTitle><DialogDescription>适用于尚未接入授权同步的平台账号。</DialogDescription></DialogHeader><FieldGroup className="mt-5"><Field><FieldLabel>平台</FieldLabel><Select value={platform} onValueChange={(value) => setPlatform(value as PlatformId)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{PLATFORM_IDS.map((id) => <SelectItem key={id} value={id}>{PLATFORM_DEFINITIONS[id].displayName}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="account-name">账号名称</FieldLabel><Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} /></Field><Field><FieldLabel htmlFor="account-handle">账号 ID</FieldLabel><Input id="account-handle" value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="不含 @" /></Field></FieldGroup><DialogFooter className="mt-6"><Button disabled={!name.trim()} onClick={() => void save()}>添加账号</Button></DialogFooter></DialogContent></Dialog>;
}

function EmptyText({ text }: { text: string }) { return <div className="py-16 text-center text-sm text-muted-foreground">{text}</div>; }
function PersonaSkeleton() { return <div className="flex flex-col gap-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-10 w-96 max-w-full" /><Skeleton className="h-64 w-full" /></div>; }
