"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, ExternalLink, Plus, RefreshCw, RotateCcw, Square } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Task = { id: string; status: string; command?: string | null; action?: string | null; conversationId?: string | null; progress?: number; stage?: string | null; errorMessage?: string | null; updatedAt: string };
type Interaction = { id: string; status: string; kind: string; actionKey: string; conversationId: string; expiresAt: string; updatedAt: string };
type Workflow = { id: string; name: string; type: string; status: string; schedule: string; timezone: string; runCount: number; runs: Array<{ id: string; status: string; createdAt: string; errorMessage?: string | null }> };
type TaskCenterData = { runs: Task[]; jobs: Task[]; interactions: Interaction[]; turns: Task[]; workflowRuns: Task[] };
const EMPTY_TASKS: TaskCenterData = { runs: [], jobs: [], interactions: [], turns: [], workflowRuns: [] };

export default function TasksPage() {
  const [filter, setFilter] = useState("all");
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const queryClient = useQueryClient();
  const taskCenterQuery = useQuery({
    queryKey: ["workspace", "task-center"],
    queryFn: async () => {
      const [tasksResponse, workflowsResponse] = await Promise.all([
        fetch("/api/tasks", { cache: "no-store" }),
        fetch("/api/workflows", { cache: "no-store" }),
      ]);
      if (!tasksResponse.ok || !workflowsResponse.ok) throw new Error("加载任务中心失败");
      const [tasks, workflowData] = await Promise.all([
        tasksResponse.json() as Promise<TaskCenterData>,
        workflowsResponse.json() as Promise<{ workflows: Workflow[] }>,
      ]);
      return { tasks, workflows: workflowData.workflows ?? [] };
    },
    staleTime: 20 * 1000,
    refetchInterval: (query) => {
      const rows = query.state.data?.tasks;
      return rows && [...rows.runs, ...rows.jobs, ...rows.turns].some((item) => ["queued", "running", "pending"].includes(item.status)) ? 5000 : false;
    },
  });
  const data = taskCenterQuery.data?.tasks ?? EMPTY_TASKS;
  const workflows = taskCenterQuery.data?.workflows ?? [];
  const load = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["workspace", "task-center"] });
  }, [queryClient]);
  useEffect(() => {
    if (taskCenterQuery.error) toast.error(taskCenterQuery.error instanceof Error ? taskCenterQuery.error.message : "加载任务中心失败");
  }, [taskCenterQuery.error]);
  const taskRows = useMemo(() => [
    ...data.runs.map((task) => ({ ...task, kind: "run" as const, label: task.command || "Agent 运行" })),
    ...data.jobs.map((task) => ({ ...task, kind: "job" as const, label: task.action || "后台任务" })),
    ...data.turns.map((task) => ({ ...task, kind: "queue" as const, label: "排队消息" })),
  ].filter((task) => filter === "all" || task.status === filter).sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)), [data, filter]);

  async function taskAction(kind: "run" | "job" | "queue", id: string, action: "cancel" | "retry") {
    const response = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, action }) });
    if (!response.ok) return toast.error("任务操作失败"); toast.success(action === "retry" ? "已创建重试任务" : "任务已取消"); await load();
  }
  async function workflowAction(workflowId: string, action: "pause" | "resume" | "archive") {
    const response = await fetch("/api/workflows", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workflowId, action }) });
    if (!response.ok) return toast.error("计划任务操作失败"); await load();
  }

  return <main className="min-h-dvh px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8">
    <header className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><h1 className="text-xl font-semibold">任务中心</h1><p className="text-sm text-muted-foreground">查看运行、后台任务、待确认事项和云端计划。</p></div><Button variant="outline" size="icon" title="刷新" onClick={() => void load()}><RefreshCw /></Button><Button onClick={() => setWorkflowOpen(true)}><Plus data-icon="inline-start" />新建计划</Button></header>
    <Tabs defaultValue="tasks" className="mt-6"><TabsList><TabsTrigger value="tasks">运行任务</TabsTrigger><TabsTrigger value="interactions">待处理</TabsTrigger><TabsTrigger value="workflows">计划任务</TabsTrigger></TabsList>
      <TabsContent value="tasks" className="mt-5"><div className="mb-4 max-w-48"><Select value={filter} onValueChange={setFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{["all", "queued", "running", "waiting_input", "completed", "succeeded", "failed", "canceled"].map((status) => <SelectItem key={status} value={status}>{status === "all" ? "全部状态" : status}</SelectItem>)}</SelectGroup></SelectContent></Select></div><div className="flex flex-col divide-y">{taskRows.map((task) => <div key={`${task.kind}:${task.id}`} className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{task.label}</span><Badge variant={task.status === "failed" ? "destructive" : "outline"}>{task.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{task.stage || new Date(task.updatedAt).toLocaleString()}{task.progress !== undefined ? ` · ${task.progress}%` : ""}</p></div>{task.conversationId ? <Button size="icon" variant="ghost" title="进入会话" asChild><a href={`/creator?conversationId=${task.conversationId}`}><ExternalLink /></a></Button> : null}{["failed", "canceled"].includes(task.status) && task.kind === "job" ? <Button size="sm" variant="outline" onClick={() => void taskAction(task.kind, task.id, "retry")}><RotateCcw data-icon="inline-start" />重试</Button> : null}{["queued", "running", "pending", "waiting_input"].includes(task.status) ? <Button size="sm" variant="outline" onClick={() => void taskAction(task.kind, task.id, "cancel")}><Square data-icon="inline-start" />取消</Button> : null}</div>)}{!taskRows.length ? <Empty text="没有符合条件的任务。" /> : null}</div></TabsContent>
      <TabsContent value="interactions" className="mt-5"><div className="flex flex-col divide-y">{data.interactions.map((item) => <div key={item.id} className="flex items-center gap-3 py-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium">{item.kind === "approval" ? "等待确认" : "等待补充信息"}</span><Badge variant="outline">{item.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.actionKey} · 到期 {new Date(item.expiresAt).toLocaleString()}</p></div><Button size="sm" variant="outline" asChild><a href={`/creator?conversationId=${item.conversationId}`}>进入会话</a></Button></div>)}{!data.interactions.length ? <Empty text="当前没有待处理交互。" /> : null}</div></TabsContent>
      <TabsContent value="workflows" className="mt-5"><div className="flex flex-col divide-y">{workflows.map((workflow) => <div key={workflow.id} className="py-4"><div className="flex flex-wrap items-center gap-3"><CalendarClock className="h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-medium">{workflow.name}</span><Badge variant="outline">{workflow.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{workflow.type} · {workflow.schedule} · {workflow.timezone} · 已执行 {workflow.runCount} 次</p></div>{workflow.status === "active" ? <Button size="sm" variant="outline" onClick={() => void workflowAction(workflow.id, "pause")}>暂停</Button> : workflow.status === "paused" ? <Button size="sm" variant="outline" onClick={() => void workflowAction(workflow.id, "resume")}>恢复</Button> : null}{workflow.status !== "archived" ? <Button size="sm" variant="ghost" onClick={() => window.confirm("确认归档这个计划任务？") && void workflowAction(workflow.id, "archive")}>归档</Button> : null}</div>{workflow.runs[0] ? <p className="mt-2 pl-7 text-xs text-muted-foreground">最近运行：{workflow.runs[0].status} · {new Date(workflow.runs[0].createdAt).toLocaleString()}</p> : null}</div>)}{!workflows.length ? <Empty text="尚未创建计划任务。" /> : null}</div></TabsContent>
    </Tabs><WorkflowDialog open={workflowOpen} onOpenChange={setWorkflowOpen} onSaved={load} />
  </main>;
}

function WorkflowDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void> }) {
  const [type, setType] = useState("hotspot_refresh"); const [name, setName] = useState(""); const [schedule, setSchedule] = useState("0 9 * * *"); const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai"); const [brief, setBrief] = useState("");
  async function save() { const response = await fetch("/api/workflows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, name, schedule, timezone, config: type === "draft_generation" ? { brief, platform: "xiaohongshu", autoPublish: false } : {}, maxRuns: 365 }) }); if (!response.ok) return toast.error("创建计划失败，请检查 Cron 和时区"); props.onOpenChange(false); toast.success("计划任务已创建"); await props.onSaved(); }
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}><DialogContent><DialogHeader><DialogTitle>新建云端计划</DialogTitle><DialogDescription>仅支持白名单领域任务；定时创作只生成草稿。</DialogDescription></DialogHeader><FieldGroup className="mt-5"><Field><FieldLabel>任务类型</FieldLabel><Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{[["hotspot_refresh", "热点刷新"], ["research_digest", "研究摘要"], ["draft_generation", "定时生成草稿"], ["metrics_collection", "指标采集"], ["retrospective_prepare", "复盘准备"]].map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectGroup></SelectContent></Select></Field><Field><FieldLabel htmlFor="workflow-name">名称</FieldLabel><Input id="workflow-name" value={name} onChange={(event) => setName(event.target.value)} /></Field><div className="grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="workflow-cron">Cron</FieldLabel><Input id="workflow-cron" value={schedule} onChange={(event) => setSchedule(event.target.value)} /></Field><Field><FieldLabel htmlFor="workflow-timezone">时区</FieldLabel><Input id="workflow-timezone" value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field></div>{type === "draft_generation" ? <Field><FieldLabel htmlFor="workflow-brief">创作要求</FieldLabel><Textarea id="workflow-brief" value={brief} onChange={(event) => setBrief(event.target.value)} rows={4} /></Field> : null}</FieldGroup><DialogFooter className="mt-6"><Button disabled={!name.trim()} onClick={() => void save()}>创建计划</Button></DialogFooter></DialogContent></Dialog>;
}
function Empty({ text }: { text: string }) { return <div className="py-16 text-center text-sm text-muted-foreground">{text}</div>; }
