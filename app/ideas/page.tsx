"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArrowRight, Lightbulb, Loader2, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { readApiJson } from "@/lib/api-client";

type Idea = {
  id: string;
  title: string;
  source: string;
  platform: "xiaohongshu" | "douyin" | null;
  status: "saved" | "planning" | "creating" | "published" | "archived";
  angle: string | null;
  audience: string | null;
  notes: string | null;
  updatedAt: string;
  trendTopic?: { currentScore: number | null; observations: Array<{ source: string; observedAt: string }> } | null;
  _count: { contents: number };
};

export default function IdeasPage() {
  const router = useRouter();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", angle: "", audience: "", notes: "", platform: "xiaohongshu" as "xiaohongshu" | "douyin" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await readApiJson<{ ideas: Idea[] }>(await fetch("/api/ideas", { cache: "no-store" }));
      setIdeas(data.ideas);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "选题加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return keyword ? ideas.filter((idea) => `${idea.title} ${idea.angle ?? ""} ${idea.notes ?? ""}`.toLowerCase().includes(keyword)) : ideas;
  }, [ideas, query]);

  async function createIdea() {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const data = await readApiJson<{ idea: Idea }>(await fetch("/api/ideas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "manual", ...form }) }));
      setIdeas((current) => [data.idea, ...current]);
      setForm({ title: "", angle: "", audience: "", notes: "", platform: "xiaohongshu" });
      setShowForm(false);
      toast.success("选题已保存");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败");
    } finally { setSaving(false); }
  }

  async function archive(ideaId: string) {
    try {
      await readApiJson(await fetch(`/api/ideas/${ideaId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "archived" }) }));
      setIdeas((current) => current.filter((idea) => idea.id !== ideaId));
      toast.success("已归档");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "归档失败"); }
  }

  async function start(idea: Idea, platform: "xiaohongshu" | "douyin") {
    setStartingId(idea.id);
    try {
      const data = await readApiJson<{ content: { id: string } }>(await fetch("/api/content", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ideaId: idea.id, platform, contentKind: platform === "douyin" ? "douyin_video_script" : "xhs_graphic", title: idea.title, inputText: [idea.title, idea.angle, idea.audience && `目标受众：${idea.audience}`, idea.notes].filter(Boolean).join("\n") }) }));
      router.push(`/creator/${platform}?contentId=${data.content.id}`);
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "创建项目失败"); setStartingId(null); }
  }

  return (
    <AppShell title="选题库" description="热点、手工灵感和参考资料在这里汇合；决定方向后再进入独立创作工作区。" actions={<Button size="sm" onClick={() => setShowForm((value) => !value)}><Plus className="h-4 w-4" />手工选题</Button>}>
      <div className="space-y-5">
        {showForm ? <Card><CardHeader><CardTitle>记录新选题</CardTitle><CardDescription>先写清楚要解决的问题，不需要在这里生成正文。</CardDescription></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2"><label className="lg:col-span-2"><span className="mb-2 block text-sm font-medium">选题标题</span><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="例如：第一次自由职业，怎样安排不焦虑的一周" /></label><label><span className="mb-2 block text-sm font-medium">默认平台</span><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value as typeof form.platform })}><option value="xiaohongshu">小红书图文</option><option value="douyin">抖音视频</option></select></label><label><span className="mb-2 block text-sm font-medium">目标受众</span><Input value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} placeholder="具体到处境，而不是泛人群" /></label><label className="lg:col-span-2"><span className="mb-2 block text-sm font-medium">切入角度</span><Textarea value={form.angle} onChange={(event) => setForm({ ...form, angle: event.target.value })} placeholder="你准备提供什么独特信息或经验？" /></label><label className="lg:col-span-2"><span className="mb-2 block text-sm font-medium">证据与备注</span><Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="案例、数据、限制、不能说的内容……" /></label><div className="flex justify-end gap-2 lg:col-span-2"><Button variant="outline" onClick={() => setShowForm(false)}>取消</Button><Button onClick={() => void createIdea()} disabled={saving || !form.title.trim()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}保存选题</Button></div></CardContent></Card> : null}

        <div className="flex items-center gap-3"><div className="relative max-w-md flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索选题、角度或备注" /></div><Badge variant="outline">{visible.length} 个进行中</Badge></div>

        {loading ? <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-xl bg-muted" />)}</div> : !visible.length ? <Card><CardContent className="py-16 text-center"><Lightbulb className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-4 font-medium">选题库还是空的</p><p className="mt-1 text-sm text-muted-foreground">可以手工记录，也可以先去热点研究收藏一个话题。</p></CardContent></Card> : <div className="grid gap-4 lg:grid-cols-2">{visible.map((idea) => <Card key={idea.id} className="flex flex-col"><CardHeader><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="mb-2 flex items-center gap-2"><Badge variant="outline">{idea.source === "hotspot" ? "热点收藏" : idea.source === "reference" ? "参考资料" : "手工灵感"}</Badge>{idea.trendTopic?.currentScore != null ? <span className="font-mono text-xs text-brand">热度 {idea.trendTopic.currentScore.toFixed(1)}</span> : null}</div><CardTitle className="leading-6">{idea.title}</CardTitle></div><Button variant="ghost" size="icon" title="归档" onClick={() => void archive(idea.id)}><Archive className="h-4 w-4" /></Button></div><CardDescription>更新于 {new Date(idea.updatedAt).toLocaleString("zh-CN")} · 已建 {idea._count.contents} 个内容项目</CardDescription></CardHeader><CardContent className="flex flex-1 flex-col"><div className="min-h-24 space-y-3 text-sm"><p><span className="text-muted-foreground">角度：</span>{idea.angle || "待补充"}</p><p><span className="text-muted-foreground">受众：</span>{idea.audience || "待补充"}</p>{idea.notes ? <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{idea.notes}</p> : null}</div><div className="mt-5 grid grid-cols-2 gap-2"><Button variant={idea.platform === "xiaohongshu" ? "default" : "outline"} onClick={() => void start(idea, "xiaohongshu")} disabled={startingId === idea.id}>{startingId === idea.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}小红书 <ArrowRight className="h-4 w-4" /></Button><Button variant={idea.platform === "douyin" ? "default" : "outline"} onClick={() => void start(idea, "douyin")} disabled={startingId === idea.id}>抖音 <ArrowRight className="h-4 w-4" /></Button></div></CardContent></Card>)}</div>}
      </div>
    </AppShell>
  );
}
