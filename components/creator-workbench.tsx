"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  Download,
  FileClock,
  FileJson,
  Link2,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { readApiJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Platform = "xiaohongshu" | "douyin";
type ContentKind = "xhs_graphic" | "douyin_video_script";

type Idea = {
  id: string;
  title: string;
  angle: string | null;
  platform: Platform | null;
  status: string;
};

type StyleProfile = {
  id: string;
  name: string;
  platform: Platform;
  status: string;
  summary: string | null;
  confidence: number | null;
};

type ContentListItem = {
  id: string;
  title: string | null;
  status: string;
  platform?: Platform;
  contentKind?: ContentKind;
  updatedAt: string;
};

type Revision = {
  id: string;
  revisionNumber: number;
  source: string;
  title: string | null;
  bodyText: string | null;
  structuredContent: unknown;
  fullMarkdown: string | null;
  createdAt: string;
};

type ContentDetail = {
  id: string;
  title: string | null;
  platform: Platform;
  contentKind: ContentKind;
  status: string;
  inputText: string | null;
  scoreSnapshot: { total?: number; warnings?: string[] } | null;
  revisions: Revision[];
};

type JobState = {
  id: string;
  status: "queued" | "running" | "waiting_input" | "succeeded" | "failed" | "canceled";
  progress: number;
  stage: string | null;
  errorMessage: string | null;
  output?: { message?: string; score?: number };
};

type Message = { role: "user" | "assistant"; content: string };

type XhsPage = {
  pageNumber: number;
  heading: string;
  body: string;
  visualSuggestion: string;
};

type DouyinShot = {
  startSec: number;
  endSec: number;
  voiceover: string;
  visual: string;
  subtitle: string;
  camera: string;
  transition: string;
  music: string;
  risk: string;
};

type DraftState = {
  title: string;
  bodyText: string;
  structured: Record<string, unknown>;
};

export function CreatorWorkbench({ platform }: { platform: Platform }) {
  const searchParams = useSearchParams();
  const platformLabel = platform === "xiaohongshu" ? "小红书图文" : "抖音视频脚本";
  const contentKind: ContentKind =
    platform === "xiaohongshu" ? "xhs_graphic" : "douyin_video_script";
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [styles, setStyles] = useState<StyleProfile[]>([]);
  const [contents, setContents] = useState<ContentListItem[]>([]);
  const [selectedIdeaId, setSelectedIdeaId] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState("");
  const [project, setProject] = useState<ContentDetail | null>(null);
  const [draft, setDraft] = useState<DraftState>(() => emptyDraft(platform));
  const [projectTitle, setProjectTitle] = useState("");
  const [projectBrief, setProjectBrief] = useState("");
  const [job, setJob] = useState<JobState | null>(null);
  const [busy, setBusy] = useState<string | null>("boot");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState("尚未保存");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `我是你的${platformLabel}助手。聊天用于梳理思路；正式正文会保存到右侧内容画布并形成版本。`,
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const savingRef = useRef(false);

  const loadContext = useCallback(async () => {
    try {
      const [ideaData, styleData, contentData] = await Promise.all([
        readApiJson<{ ideas: Idea[] }>(await fetch("/api/ideas", { cache: "no-store" })),
        readApiJson<{ styleProfiles: StyleProfile[] }>(
          await fetch("/api/style-profiles", { cache: "no-store" }),
        ),
        readApiJson<{ contents: ContentListItem[] }>(
          await fetch("/api/content/list", { cache: "no-store" }),
        ),
      ]);
      setIdeas(ideaData.ideas.filter((idea) => !idea.platform || idea.platform === platform));
      setStyles(
        styleData.styleProfiles.filter(
          (style) => style.platform === platform && style.status === "approved",
        ),
      );
      setContents(
        contentData.contents.filter(
          (content) => !content.platform || content.platform === platform,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "工作台上下文加载失败");
    }
  }, [platform]);

  const openContent = useCallback(
    async (contentId: string) => {
      setBusy("open");
      try {
        const data = await readApiJson<{ content: ContentDetail }>(
          await fetch(`/api/content/${contentId}`, { cache: "no-store" }),
        );
        if (data.content.platform !== platform) {
          throw new Error("该内容项目属于另一个平台工作区。");
        }
        setProject(data.content);
        setDraft(draftFromContent(data.content, platform));
        setProjectTitle(data.content.title ?? "");
        setDirty(false);
        setSaveState(
          data.content.revisions[0]
            ? `已载入版本 v${data.content.revisions[0].revisionNumber}`
            : "尚未保存版本",
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "内容项目加载失败");
      } finally {
        setBusy(null);
      }
    },
    [platform],
  );

  useEffect(() => {
    void loadContext().finally(() => setBusy(null));
  }, [loadContext]);

  useEffect(() => {
    const contentId = searchParams.get("contentId");
    if (contentId) void openContent(contentId);
  }, [openContent, searchParams]);

  const saveRevision = useCallback(
    async (source: "manual" | "restored" = "manual", silent = false) => {
      if (!project || savingRef.current || (!dirty && source === "manual")) return;
      savingRef.current = true;
      setSaveState("正在保存…");
      try {
        const fullMarkdown =
          platform === "xiaohongshu"
            ? xhsMarkdown(draft)
            : douyinMarkdown(draft);
        const data = await readApiJson<{ revision: Revision }>(
          await fetch(`/api/content/${project.id}/revisions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source,
              title: draft.title,
              bodyText: draft.bodyText,
              structuredContent: draft.structured,
              fullMarkdown,
            }),
          }),
        );
        setProject((current) =>
          current
            ? { ...current, title: draft.title, revisions: [data.revision, ...current.revisions] }
            : current,
        );
        setDirty(false);
        setSaveState(`已自动保存 v${data.revision.revisionNumber}`);
        if (!silent) toast.success(`版本 v${data.revision.revisionNumber} 已保存`);
        await loadContext();
      } catch (error) {
        setSaveState("保存失败，可手动重试");
        if (!silent) toast.error(error instanceof Error ? error.message : "保存失败");
      } finally {
        savingRef.current = false;
      }
    },
    [dirty, draft, loadContext, platform, project],
  );

  useEffect(() => {
    if (!project || !dirty) return;
    const timer = window.setTimeout(() => void saveRevision("manual", true), 1800);
    return () => window.clearTimeout(timer);
  }, [dirty, draft, project, saveRevision]);

  function updateDraft(update: Partial<DraftState>) {
    setDraft((current) => ({ ...current, ...update }));
    setDirty(true);
    setSaveState("有未保存修改");
  }

  function updateStructured(update: Record<string, unknown>) {
    updateDraft({ structured: { ...draft.structured, ...update } });
  }

  async function createProject() {
    const idea = ideas.find((item) => item.id === selectedIdeaId);
    const title = projectTitle.trim() || idea?.title || "未命名内容项目";
    setBusy("create");
    try {
      const data = await readApiJson<{ content: ContentDetail }>(
        await fetch("/api/content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ideaId: selectedIdeaId || undefined,
            styleProfileId: selectedStyleId || undefined,
            platform,
            contentKind,
            title,
            inputText: projectBrief || idea?.angle || idea?.title,
          }),
        }),
      );
      setProject({ ...data.content, revisions: [] });
      setDraft({ ...emptyDraft(platform), title, bodyText: projectBrief });
      setSaveState("项目已创建，等待首个版本");
      setDirty(true);
      await loadContext();
      toast.success("内容项目已创建");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建项目失败");
    } finally {
      setBusy(null);
    }
  }

  async function generateDraft() {
    if (!project) return;
    setBusy("generate");
    try {
      if (dirty) await saveRevision("manual", true);
      const data = await readApiJson<{ jobId: string }>(
        await fetch(`/api/content/${project.id}/generate`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        }),
      );
      const completed = await pollJob(data.jobId, setJob);
      if (completed.status === "waiting_input") {
        toast.info(completed.output?.message ?? "任务需要补充信息");
        return;
      }
      if (completed.status !== "succeeded") {
        throw new Error(completed.errorMessage ?? "生成任务失败");
      }
      await openContent(project.id);
      toast.success("结构化初稿已生成并完成评分");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setBusy(null);
    }
  }

  async function scoreDraft() {
    if (!project) return;
    setBusy("score");
    try {
      if (dirty) await saveRevision("manual", true);
      const data = await readApiJson<{ score: { total: number; warnings: string[] } }>(
        await fetch(`/api/content/${project.id}/score`, { method: "POST" }),
      );
      setProject((current) =>
        current ? { ...current, scoreSnapshot: data.score } : current,
      );
      toast.success(`发布前评分：${data.score.total}/100`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "评分失败");
    } finally {
      setBusy(null);
    }
  }

  async function importReference() {
    if (!referenceUrl.trim()) return;
    setBusy("reference");
    try {
      const data = await readApiJson<{ jobId: string }>(
        await fetch("/api/references/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: referenceUrl, platform }),
        }),
      );
      const completed = await pollJob(data.jobId, setJob);
      if (completed.status === "waiting_input") {
        toast.info(completed.output?.message ?? "请补充供应商凭证或改为手工录入");
      } else if (completed.status === "succeeded") {
        toast.success("参考资料导入完成");
        setReferenceUrl("");
      } else {
        throw new Error(completed.errorMessage ?? "导入失败");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(null);
    }
  }

  async function sendChat() {
    const message = chatInput.trim();
    if (!message) return;
    setChatInput("");
    setMessages((current) => [...current, { role: "user", content: message }]);
    setBusy("chat");
    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const created = await readApiJson<{ conversation: { id: string } }>(
          await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: message.slice(0, 50) }),
          }),
        );
        activeConversationId = created.conversation.id;
        setConversationId(activeConversationId);
      }
      const response = await readApiJson<{ message: string }>(
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: activeConversationId,
            message,
          }),
        }),
      );
      setMessages((current) => [...current, { role: "assistant", content: response.message }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: `请求未完成：${error instanceof Error ? error.message : "未知错误"}` },
      ]);
    } finally {
      setBusy(null);
    }
  }

  function restoreRevision(revision: Revision) {
    setDraft({
      title: revision.title ?? "",
      bodyText: revision.bodyText ?? "",
      structured: asRecord(revision.structuredContent),
    });
    setDirty(true);
    setSaveState(`已载入 v${revision.revisionNumber}，保存后会创建新版本`);
  }

  const actions = (
    <>
      <Button variant="outline" size="sm" asChild>
        <Link href={platform === "xiaohongshu" ? "/creator/douyin" : "/creator/xiaohongshu"}>
          切换到{platform === "xiaohongshu" ? "抖音" : "小红书"}
        </Link>
      </Button>
      <Button size="sm" onClick={generateDraft} disabled={!project || busy === "generate"}>
        {busy === "generate" ? <Loader2 className="animate-spin" /> : <Sparkles />}
        生成初稿
      </Button>
    </>
  );

  return (
    <AppShell
      title={`${platformLabel}工作台`}
      description="聊天梳理思路，画布承载可编辑正文与版本"
      actions={actions}
      contentClassName="max-w-[1800px]"
    >
      {!project ? (
        <ProjectStarter
          platform={platform}
          title={projectTitle}
          brief={projectBrief}
          selectedIdeaId={selectedIdeaId}
          selectedStyleId={selectedStyleId}
          ideas={ideas}
          styles={styles}
          contents={contents}
          busy={busy}
          onTitleChange={setProjectTitle}
          onBriefChange={setProjectBrief}
          onIdeaChange={setSelectedIdeaId}
          onStyleChange={setSelectedStyleId}
          onCreate={createProject}
          onOpen={openContent}
        />
      ) : (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[310px_minmax(0,1fr)_290px]">
          <AssistantPanel
            messages={messages}
            value={chatInput}
            busy={busy === "chat"}
            referenceUrl={referenceUrl}
            referenceBusy={busy === "reference"}
            onValueChange={setChatInput}
            onSend={sendChat}
            onReferenceChange={setReferenceUrl}
            onImportReference={importReference}
          />

          <section className="min-w-0 space-y-3">
            <div className="surface flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="editorial-label">CONTENT CANVAS</p>
                <h2 className="mt-1 truncate text-base font-semibold">{draft.title || "未命名内容"}</h2>
              </div>
              <span className="text-xs text-muted-foreground">{saveState}</span>
              <Button variant="outline" size="sm" onClick={() => void saveRevision()} disabled={!dirty}>
                <Save /> 保存版本
              </Button>
              <Button variant="outline" size="sm" onClick={scoreDraft} disabled={busy === "score"}>
                {busy === "score" ? <Loader2 className="animate-spin" /> : <Check />}
                评分
              </Button>
            </div>

            {job && ["queued", "running"].includes(job.status) ? (
              <div className="surface p-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span>{job.stage ?? "任务排队中"}</span>
                  <span className="font-mono-metric">{job.progress}%</span>
                </div>
                <Progress value={job.progress} />
              </div>
            ) : null}

            {platform === "xiaohongshu" ? (
              <XhsCanvas draft={draft} onUpdate={updateDraft} onStructuredUpdate={updateStructured} />
            ) : (
              <DouyinCanvas draft={draft} onUpdate={updateDraft} onStructuredUpdate={updateStructured} />
            )}
          </section>

          <ContextPanel
            project={project}
            ideas={ideas}
            styles={styles}
            onRestore={restoreRevision}
            onRestoreSave={(revision) => {
              restoreRevision(revision);
              window.setTimeout(() => void saveRevision("restored"), 0);
            }}
            onExportJson={() => exportFile(`${draft.title || "content"}.json`, JSON.stringify(draft.structured, null, 2), "application/json")}
            onExportMarkdown={() =>
              exportFile(
                `${draft.title || "content"}.md`,
                platform === "xiaohongshu" ? xhsMarkdown(draft) : douyinMarkdown(draft),
                "text/markdown",
              )
            }
          />
        </div>
      )}
    </AppShell>
  );
}

function ProjectStarter(props: {
  platform: Platform;
  title: string;
  brief: string;
  selectedIdeaId: string;
  selectedStyleId: string;
  ideas: Idea[];
  styles: StyleProfile[];
  contents: ContentListItem[];
  busy: string | null;
  onTitleChange: (value: string) => void;
  onBriefChange: (value: string) => void;
  onIdeaChange: (value: string) => void;
  onStyleChange: (value: string) => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <p className="editorial-label">NEW CONTENT PROJECT</p>
          <CardTitle className="text-2xl">从一个清楚的选题开始</CardTitle>
          <CardDescription>
            可关联选题库和已审核风格画像。创建后，AI 生成与人工编辑都会保存为独立版本。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="block space-y-2">
            <span className="text-sm font-medium">项目标题</span>
            <Input value={props.title} onChange={(event) => props.onTitleChange(event.target.value)} placeholder="例如：三个月把内容复盘做成习惯" />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium">内容简报</span>
            <Textarea value={props.brief} onChange={(event) => props.onBriefChange(event.target.value)} className="min-h-32" placeholder={props.platform === "xiaohongshu" ? "目标读者、具体场景、想给出的价值…" : "视频目标、预期时长、开场冲突、希望观众做什么…"} />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="关联选题" value={props.selectedIdeaId} onChange={props.onIdeaChange} options={props.ideas.map((idea) => ({ value: idea.id, label: idea.title }))} emptyLabel="不关联，手工创建" />
            <SelectField label="风格画像" value={props.selectedStyleId} onChange={props.onStyleChange} options={props.styles.map((style) => ({ value: style.id, label: style.name }))} emptyLabel="不使用风格画像" />
          </div>
          <Button onClick={props.onCreate} disabled={props.busy === "create"}>
            {props.busy === "create" ? <Loader2 className="animate-spin" /> : <Plus />}
            创建内容项目
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近项目</CardTitle>
          <CardDescription>继续编辑已保存内容。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {props.contents.length ? (
            props.contents.slice(0, 10).map((content) => (
              <button key={content.id} type="button" onClick={() => props.onOpen(content.id)} className="flex w-full items-center gap-3 rounded-lg border bg-background p-3 text-left hover:border-primary/50">
                <FileClock className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{content.title || "未命名内容"}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{content.status} · {new Date(content.updatedAt).toLocaleString("zh-CN")}</span>
                </span>
              </button>
            ))
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">还没有内容项目。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AssistantPanel(props: {
  messages: Message[];
  value: string;
  busy: boolean;
  referenceUrl: string;
  referenceBusy: boolean;
  onValueChange: (value: string) => void;
  onSend: () => void;
  onReferenceChange: (value: string) => void;
  onImportReference: () => void;
}) {
  return (
    <aside className="surface flex min-h-[520px] flex-col overflow-hidden xl:sticky xl:top-[92px] xl:h-[calc(100dvh-116px)]">
      <div className="border-b p-4">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">AI 助手</h2>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">用于讨论和研究，不替代右侧内容画布。</p>
      </div>
      <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {props.messages.map((message, index) => (
          <div key={`${message.role}-${index}`} className={cn("rounded-lg px-3 py-2 text-sm leading-6", message.role === "user" ? "ml-8 bg-primary text-primary-foreground" : "mr-5 bg-muted")}>
            {message.content}
          </div>
        ))}
        {props.busy ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
      </div>
      <div className="border-t p-3">
        <details className="mb-3 rounded-lg border bg-background p-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium [&::-webkit-details-marker]:hidden">
            <Link2 className="h-3.5 w-3.5 text-primary" /> 导入账号、作品或网页资料
            <ChevronDown className="ml-auto h-3.5 w-3.5" />
          </summary>
          <div className="mt-2 flex gap-2">
            <Input value={props.referenceUrl} onChange={(event) => props.onReferenceChange(event.target.value)} className="h-9 text-xs" placeholder="粘贴公开或授权链接" />
            <Button size="sm" variant="outline" onClick={props.onImportReference} disabled={props.referenceBusy}>
              {props.referenceBusy ? <Loader2 className="animate-spin" /> : "导入"}
            </Button>
          </div>
        </details>
        <div className="flex gap-2">
          <Textarea value={props.value} onChange={(event) => props.onValueChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); props.onSend(); } }} className="min-h-20 resize-none text-sm" placeholder="说清楚你的场景、犹豫或修改方向…" />
          <Button size="icon" onClick={props.onSend} disabled={!props.value.trim() || props.busy} aria-label="发送消息">
            <Send />
          </Button>
        </div>
      </div>
    </aside>
  );
}

function XhsCanvas(props: {
  draft: DraftState;
  onUpdate: (value: Partial<DraftState>) => void;
  onStructuredUpdate: (value: Record<string, unknown>) => void;
}) {
  const pages = arrayRecords(props.draft.structured.pages) as unknown as XhsPage[];
  const tags = stringArray(props.draft.structured.tags);
  const coverTexts = stringArray(props.draft.structured.coverTextOptions);
  function updatePage(index: number, update: Partial<XhsPage>) {
    props.onStructuredUpdate({ pages: pages.map((page, pageIndex) => pageIndex === index ? { ...page, ...update } : page) });
  }
  return (
    <div className="surface space-y-6 p-4 sm:p-6">
      <label className="block space-y-2">
        <span className="editorial-label">主标题</span>
        <Input value={props.draft.title} onChange={(event) => props.onUpdate({ title: event.target.value })} className="h-12 text-lg font-semibold" />
      </label>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="editorial-label">封面文案</span>
          <Button type="button" size="sm" variant="ghost" onClick={() => props.onStructuredUpdate({ coverTextOptions: [...coverTexts, "新封面文案"] })}><Plus /> 添加</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {coverTexts.map((text, index) => (
            <Input key={index} value={text} onChange={(event) => props.onStructuredUpdate({ coverTextOptions: coverTexts.map((item, itemIndex) => itemIndex === index ? event.target.value : item) })} className="h-9 w-48" />
          ))}
        </div>
      </div>
      <Separator />
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div><p className="editorial-label">分页结构</p><p className="mt-1 text-xs text-muted-foreground">每页同时编辑正文和视觉提示。</p></div>
          <Button type="button" size="sm" variant="outline" onClick={() => props.onStructuredUpdate({ pages: [...pages, { pageNumber: pages.length + 1, heading: "新页面", body: "", visualSuggestion: "" }] })}><Plus /> 添加一页</Button>
        </div>
        <div className="space-y-3">
          {pages.map((page, index) => (
            <article key={index} className="rounded-xl border bg-background p-4">
              <div className="mb-3 flex items-center gap-3">
                <span className="font-mono-metric flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-xs text-background">{index + 1}</span>
                <Input value={page.heading ?? ""} onChange={(event) => updatePage(index, { heading: event.target.value, pageNumber: index + 1 })} className="h-9 flex-1 font-medium" placeholder="这一页讲什么" />
                <Button type="button" size="icon" variant="ghost" onClick={() => props.onStructuredUpdate({ pages: pages.filter((_, itemIndex) => itemIndex !== index).map((item, itemIndex) => ({ ...item, pageNumber: itemIndex + 1 })) })} aria-label="删除页面"><Trash2 /></Button>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_260px]">
                <Textarea value={page.body ?? ""} onChange={(event) => updatePage(index, { body: event.target.value })} className="min-h-28" placeholder="页面正文" />
                <Textarea value={page.visualSuggestion ?? ""} onChange={(event) => updatePage(index, { visualSuggestion: event.target.value })} className="min-h-28 bg-muted/60" placeholder="构图、照片、标注、版式建议" />
              </div>
            </article>
          ))}
        </div>
      </div>
      <label className="block space-y-2"><span className="editorial-label">完整正文</span><Textarea value={props.draft.bodyText} onChange={(event) => { props.onUpdate({ bodyText: event.target.value }); props.onStructuredUpdate({ bodyText: event.target.value }); }} className="min-h-56 leading-7" /></label>
      <label className="block space-y-2"><span className="editorial-label">互动收尾</span><Textarea value={stringValue(props.draft.structured.interactionEnding)} onChange={(event) => props.onStructuredUpdate({ interactionEnding: event.target.value })} className="min-h-20" /></label>
      <label className="block space-y-2"><span className="editorial-label">标签（空格分隔）</span><Input value={tags.join(" ")} onChange={(event) => props.onStructuredUpdate({ tags: event.target.value.split(/\s+/).filter(Boolean) })} /></label>
    </div>
  );
}

function DouyinCanvas(props: {
  draft: DraftState;
  onUpdate: (value: Partial<DraftState>) => void;
  onStructuredUpdate: (value: Record<string, unknown>) => void;
}) {
  const shots = arrayRecords(props.draft.structured.shots) as unknown as DouyinShot[];
  const tags = stringArray(props.draft.structured.tags);
  function updateShot(index: number, update: Partial<DouyinShot>) {
    props.onStructuredUpdate({ shots: shots.map((shot, shotIndex) => shotIndex === index ? { ...shot, ...update } : shot) });
  }
  return (
    <div className="surface space-y-6 p-4 sm:p-6">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
        <label className="block space-y-2"><span className="editorial-label">视频标题</span><Input value={props.draft.title} onChange={(event) => props.onUpdate({ title: event.target.value })} className="h-12 text-lg font-semibold" /></label>
        <label className="block space-y-2"><span className="editorial-label">总时长（秒）</span><Input type="number" min={10} value={numberValue(props.draft.structured.durationSec)} onChange={(event) => props.onStructuredUpdate({ durationSec: Number(event.target.value) })} className="h-12 font-mono-metric" /></label>
      </div>
      <label className="block space-y-2"><span className="editorial-label">前三秒钩子</span><Textarea value={stringValue(props.draft.structured.hook)} onChange={(event) => props.onStructuredUpdate({ hook: event.target.value })} className="min-h-20" /></label>
      <Separator />
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div><p className="editorial-label">逐秒分镜</p><p className="mt-1 text-xs text-muted-foreground">时间必须连续；每镜包含口播、画面、字幕、镜头、转场、音乐和风险。</p></div>
          <Button type="button" size="sm" variant="outline" onClick={() => { const start = shots.at(-1)?.endSec ?? 0; props.onStructuredUpdate({ shots: [...shots, { startSec: start, endSec: start + 3, voiceover: "", visual: "", subtitle: "", camera: "中景", transition: "直接切换", music: "延续", risk: "" }] }); }}><Plus /> 添加分镜</Button>
        </div>
        <div className="space-y-3">
          {shots.map((shot, index) => (
            <article key={index} className="rounded-xl border bg-background p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono-metric text-xs font-medium text-primary">SHOT {String(index + 1).padStart(2, "0")}</span>
                <Input type="number" step="0.1" value={shot.startSec ?? 0} onChange={(event) => updateShot(index, { startSec: Number(event.target.value) })} className="h-8 w-20 font-mono-metric" aria-label="开始秒数" />
                <span className="text-muted-foreground">—</span>
                <Input type="number" step="0.1" value={shot.endSec ?? 0} onChange={(event) => updateShot(index, { endSec: Number(event.target.value) })} className="h-8 w-20 font-mono-metric" aria-label="结束秒数" />
                <span className="text-xs text-muted-foreground">秒</span>
                <Button type="button" size="icon" variant="ghost" className="ml-auto" onClick={() => props.onStructuredUpdate({ shots: shots.filter((_, itemIndex) => itemIndex !== index) })} aria-label="删除分镜"><Trash2 /></Button>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <ShotField label="口播" value={shot.voiceover} onChange={(value) => updateShot(index, { voiceover: value })} />
                <ShotField label="画面" value={shot.visual} onChange={(value) => updateShot(index, { visual: value })} />
                <ShotField label="字幕" value={shot.subtitle} onChange={(value) => updateShot(index, { subtitle: value })} />
                <ShotField label="镜头" value={shot.camera} onChange={(value) => updateShot(index, { camera: value })} />
                <ShotField label="转场" value={shot.transition} onChange={(value) => updateShot(index, { transition: value })} />
                <ShotField label="音乐提示" value={shot.music} onChange={(value) => updateShot(index, { music: value })} />
              </div>
              <label className="mt-3 block space-y-1"><span className="text-xs font-medium text-amber-800">风险提示</span><Input value={shot.risk ?? ""} onChange={(event) => updateShot(index, { risk: event.target.value })} className="h-9 border-amber-200 bg-amber-50" /></label>
            </article>
          ))}
        </div>
      </div>
      <label className="block space-y-2"><span className="editorial-label">发布文案</span><Textarea value={props.draft.bodyText} onChange={(event) => { props.onUpdate({ bodyText: event.target.value }); props.onStructuredUpdate({ caption: event.target.value }); }} className="min-h-36 leading-7" /></label>
      <label className="block space-y-2"><span className="editorial-label">标签（空格分隔）</span><Input value={tags.join(" ")} onChange={(event) => props.onStructuredUpdate({ tags: event.target.value.split(/\s+/).filter(Boolean) })} /></label>
    </div>
  );
}

function ContextPanel(props: {
  project: ContentDetail;
  ideas: Idea[];
  styles: StyleProfile[];
  onRestore: (revision: Revision) => void;
  onRestoreSave: (revision: Revision) => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
}) {
  return (
    <aside className="space-y-3 xl:sticky xl:top-[92px] xl:max-h-[calc(100dvh-116px)] xl:overflow-y-auto">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">发布前评分</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-end gap-2"><span className="font-mono-metric text-4xl font-medium">{props.project.scoreSnapshot?.total ?? "--"}</span><span className="pb-1 text-xs text-muted-foreground">/100</span></div>
          {props.project.scoreSnapshot?.warnings?.length ? <ul className="mt-3 space-y-1 text-xs leading-5 text-muted-foreground">{props.project.scoreSnapshot.warnings.slice(0, 4).map((warning) => <li key={warning}>· {warning}</li>)}</ul> : <p className="mt-2 text-xs text-muted-foreground">保存版本后执行评分。</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">版本历史</CardTitle><CardDescription>恢复旧版会创建新版本，不覆盖历史。</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {props.project.revisions.length ? props.project.revisions.map((revision) => (
            <div key={revision.id} className="rounded-lg border bg-background p-3">
              <div className="flex items-center justify-between gap-2"><span className="font-mono-metric text-xs font-medium">v{revision.revisionNumber}</span><Badge variant="outline">{revision.source}</Badge></div>
              <p className="mt-2 truncate text-xs font-medium">{revision.title || "未命名版本"}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{new Date(revision.createdAt).toLocaleString("zh-CN")}</p>
              <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={() => props.onRestore(revision)}><FileClock /> 预览</Button><Button size="sm" variant="ghost" onClick={() => props.onRestoreSave(revision)}><RotateCcw /> 恢复</Button></div>
            </div>
          )) : <p className="text-xs text-muted-foreground">还没有版本。</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">导出</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={props.onExportMarkdown}><Download /> Markdown</Button><Button variant="outline" size="sm" onClick={props.onExportJson}><FileJson /> JSON</Button></CardContent>
      </Card>
      <details className="surface p-4"><summary className="cursor-pointer text-sm font-semibold">当前可用资产</summary><div className="mt-3 space-y-2 text-xs text-muted-foreground"><p>选题：{props.ideas.length} 条</p><p>已审核风格画像：{props.styles.length} 个</p></div></details>
    </aside>
  );
}

function ShotField(props: { label: string; value?: string; onChange: (value: string) => void }) {
  return <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">{props.label}</span><Textarea value={props.value ?? ""} onChange={(event) => props.onChange(event.target.value)} className="min-h-20" /></label>;
}

function SelectField(props: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; emptyLabel: string }) {
  return <label className="block space-y-2"><span className="text-sm font-medium">{props.label}</span><select value={props.value} onChange={(event) => props.onChange(event.target.value)} className="h-11 w-full rounded-lg border bg-background px-3 text-sm"><option value="">{props.emptyLabel}</option>{props.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function emptyDraft(platform: Platform): DraftState {
  return platform === "xiaohongshu"
    ? { title: "", bodyText: "", structured: { titleOptions: [], coverTextOptions: ["封面文案"], pages: [{ pageNumber: 1, heading: "开场", body: "", visualSuggestion: "" }, { pageNumber: 2, heading: "核心内容", body: "", visualSuggestion: "" }, { pageNumber: 3, heading: "收尾", body: "", visualSuggestion: "" }], bodyText: "", tags: [], interactionEnding: "", riskNotes: [] } }
    : { title: "", bodyText: "", structured: { hook: "", durationSec: 30, shots: [{ startSec: 0, endSec: 3, voiceover: "", visual: "", subtitle: "", camera: "近景", transition: "直接切换", music: "轻快开场", risk: "" }, { startSec: 3, endSec: 30, voiceover: "", visual: "", subtitle: "", camera: "中景", transition: "直接切换", music: "延续", risk: "" }], caption: "", tags: [], riskNotes: [] } };
}

function draftFromContent(content: ContentDetail, platform: Platform): DraftState {
  const latest = content.revisions[0];
  if (!latest) return { ...emptyDraft(platform), title: content.title ?? "", bodyText: content.inputText ?? "" };
  return { title: latest.title ?? content.title ?? "", bodyText: latest.bodyText ?? "", structured: asRecord(latest.structuredContent) };
}

async function pollJob(jobId: string, onUpdate: (job: JobState) => void) {
  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    const data = await readApiJson<{ job: JobState }>(
      await fetch(`/api/jobs/${jobId}`, { cache: "no-store" }),
    );
    onUpdate(data.job);
    if (["succeeded", "failed", "canceled", "waiting_input"].includes(data.job.status)) return data.job;
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
  }
  throw new Error("任务等待超时，可稍后在任务状态中继续查看。");
}

function xhsMarkdown(draft: DraftState) {
  const pages = arrayRecords(draft.structured.pages) as unknown as XhsPage[];
  return [`# ${draft.title}`, ...pages.map((page) => `## 第 ${page.pageNumber} 页：${page.heading}\n\n${page.body}\n\n> 视觉：${page.visualSuggestion}`), draft.bodyText, stringArray(draft.structured.tags).map((tag) => `#${tag}`).join(" ")].join("\n\n");
}

function douyinMarkdown(draft: DraftState) {
  const shots = arrayRecords(draft.structured.shots) as unknown as DouyinShot[];
  return [`# ${draft.title}`, "| 时间 | 口播 | 画面 | 字幕 | 镜头 | 转场 | 音乐 | 风险 |", "| --- | --- | --- | --- | --- | --- | --- | --- |", ...shots.map((shot) => `| ${shot.startSec}-${shot.endSec}s | ${shot.voiceover} | ${shot.visual} | ${shot.subtitle} | ${shot.camera} | ${shot.transition} | ${shot.music} | ${shot.risk || "无"} |`), draft.bodyText].join("\n");
}

function exportFile(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName.replace(/[\\/:*?"<>|]/g, "-");
  anchor.click();
  URL.revokeObjectURL(url);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function arrayRecords(value: unknown): Array<Record<string, unknown>> { return Array.isArray(value) ? value.map(asRecord) : []; }
function stringArray(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []; }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown): number { return typeof value === "number" ? value : 0; }
