"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Archive,
  BarChart3,
  Bot,
  Check,
  ChevronRight,
  Copy,
  FileText,
  History,
  Loader2,
  Menu,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Pin,
  Plus,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  HotspotOpportunityPanel,
  HotspotRadarDashboard,
  filterHotspotsByPlatform,
  hotspotTopics,
  type HotspotPlatform,
  type HotspotSourceHealth,
  type HotspotTopic,
  type HotspotWindow,
} from "@/components/hotspot-radar";

type BenchmarkAccount = {
  id: string;
  xhsId: string | null;
  nickname: string | null;
  description: string | null;
  category: string | null;
  followerCount: number | null;
  updatedAt: string;
  notes?: { id: string; title: string | null; tags: string[] }[];
  _count?: { notes: number };
};

type Persona = {
  id: string;
  name: string | null;
  niche: string | null;
  creatorIdentity: string | null;
  targetAudience: string | null;
  contentStyle: string | null;
  isDefault: boolean;
};

type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata?: unknown;
  createdAt: string;
};

type Conversation = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages?: ConversationMessage[];
};

type GeneratedContent = {
  id: string;
  title: string | null;
  status: string;
  outputType: string;
  createdAt: string;
  updatedAt: string;
};

type ChatIntent =
  | "add_benchmark_account"
  | "analyze_account"
  | "generate_report"
  | "generate_advice"
  | "generate_content"
  | "optimize_content"
  | "configure_persona"
  | "general_chat";

type ChatResponse = {
  conversationId: string;
  intent: ChatIntent;
  message: string;
  artifact?: unknown;
};

type ApiError = {
  error?: { message?: string };
};

type BusyState =
  | "boot"
  | "conversations"
  | "accounts"
  | "personas"
  | "send"
  | "delete"
  | "save"
  | null;

type WorkspaceMode = "chat" | "hotspots";

type HotspotPayload = {
  generatedAt: string;
  platforms: HotspotPlatform[];
  topics: HotspotTopic[];
  sourceHealth: HotspotSourceHealth[];
  summary: {
    totalItems: number;
    activeSources: number;
    crossPlatformTopics: number;
    source: string;
  };
};

const conceptPath =
  "C:\\Users\\15873\\.codex\\generated_images\\019f291e-4654-7d82-a3d9-5c070b093bc5\\ig_0719eac0270c7d61016a47f7bfe9a48198948e3c73f472e1bc.png";

const seededPinnedTimestamp = "2026-01-01T08:30:00.000";
const seededProjectTimestamp = "2025-12-31T18:49:00.000";
const welcomeMessageTimestamp = "2026-01-01T08:49:00.000";

const quickActions = [
  { label: "添加对标账号", value: "mock_creator_001" },
  { label: "分析选中账号", value: "/analyze" },
  { label: "生成图文", value: "/content 大学生如何建立稳定内容节奏" },
  { label: "保存草稿", value: "__save_latest__" },
] as const;

const seededConversations: Conversation[] = [
  {
    id: "seed-pinned-1",
    title: "对标账号分析：大学生成长赛道",
    createdAt: seededPinnedTimestamp,
    updatedAt: seededPinnedTimestamp,
  },
  {
    id: "seed-project-1",
    title: "7 月小红书选题实验",
    createdAt: seededProjectTimestamp,
    updatedAt: seededProjectTimestamp,
  },
];

const initialMessages: ConversationMessage[] = [
  {
    id: "welcome-1",
    role: "assistant",
    content:
      "你可以直接粘贴小红书账号、主页链接或笔记链接。我会先识别对标对象，再把分析、图文草稿和保存动作放在同一个对话里完成。",
    createdAt: welcomeMessageTimestamp,
  },
];

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Request failed with ${response.status}`);
  }
  return data;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function groupConversationDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  if (date.toDateString() === today.toDateString()) return "今天";
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  if (date > sevenDaysAgo) return "近 7 天";
  return "项目";
}

function isDatabaseUnavailableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Can't reach database server") ||
    message.includes("DATABASE_URL") ||
    message.includes("Prisma") ||
    message.includes("database")
  );
}

function inferArtifactKind(message: ConversationMessage) {
  const text = message.content;
  if (text.includes("Benchmark analysis") || text.includes("对标分析")) {
    return "analysis";
  }
  if (text.includes("## Title options") || text.includes("## Page structure")) {
    return "draft";
  }
  if (text.includes("Added benchmark account") || text.includes("账号")) {
    return "account";
  }
  return "text";
}

function getConversationTitle(conversation: Conversation) {
  return conversation.title?.trim() || "未命名对话";
}

function getAccountLabel(account: BenchmarkAccount) {
  return account.nickname ?? account.xhsId ?? "未命名账号";
}

function getAccountIdentity(account: BenchmarkAccount) {
  return getAccountLabel(account).trim().toLowerCase();
}

function uniqueAccountsByIdentity(accountList: BenchmarkAccount[]) {
  const seen = new Set<string>();
  return accountList.filter((account) => {
    const identity = getAccountIdentity(account);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export default function HomePage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>(initialMessages);
  const [accounts, setAccounts] = useState<BenchmarkAccount[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [contents, setContents] = useState<GeneratedContent[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [composer, setComposer] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [busy, setBusy] = useState<BusyState>("boot");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("hotspots");
  const [hotspotPlatform, setHotspotPlatform] = useState<HotspotPlatform>("全平台");
  const [hotspotWindow, setHotspotWindow] = useState<HotspotWindow>("1小时");
  const [hotspotPayload, setHotspotPayload] = useState<HotspotPayload | null>(null);
  const [hotspotLoading, setHotspotLoading] = useState(false);
  const [hotspotError, setHotspotError] = useState<string | null>(null);
  const [selectedHotspotId, setSelectedHotspotId] = useState(hotspotTopics[0].id);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [latestDraft, setLatestDraft] = useState<{ id?: string; markdown: string } | null>(null);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  const selectedAccounts = useMemo(
    () => uniqueAccountsByIdentity(accounts.filter((account) => selectedIds.includes(account.id))),
    [accounts, selectedIds]
  );

  const selectedAccountIds = useMemo(
    () => selectedAccounts.map((account) => account.id),
    [selectedAccounts]
  );

  const visibleAccounts = useMemo(() => {
    const selectedIdentities = new Set(selectedAccounts.map(getAccountIdentity));
    const unselectedAccounts = accounts.filter(
      (account) => !selectedIdentities.has(getAccountIdentity(account))
    );
    return [...selectedAccounts, ...uniqueAccountsByIdentity(unselectedAccounts)];
  }, [accounts, selectedAccounts]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId),
    [activeConversationId, conversations]
  );

  const defaultPersona = useMemo(
    () => personas.find((persona) => persona.isDefault) ?? personas[0],
    [personas]
  );

  const filteredConversations = useMemo(() => {
    const remote = conversations.filter((conversation) =>
      getConversationTitle(conversation).toLowerCase().includes(conversationSearch.toLowerCase())
    );
    const seeded = seededConversations.filter((conversation) =>
      getConversationTitle(conversation).toLowerCase().includes(conversationSearch.toLowerCase())
    );
    return [...remote, ...seeded].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [conversationSearch, conversations]);

  const groupedConversations = useMemo(() => {
    return filteredConversations.reduce<Record<string, Conversation[]>>((groups, conversation) => {
      const key = conversation.id.startsWith("seed-project") ? "项目" : groupConversationDate(conversation.updatedAt);
      groups[key] = [...(groups[key] ?? []), conversation];
      return groups;
    }, {});
  }, [filteredConversations]);

  const selectedHotspot = useMemo(
    () => {
      const topics = hotspotPayload?.topics?.length ? hotspotPayload.topics : hotspotTopics;
      return topics.find((topic) => topic.id === selectedHotspotId) ?? topics[0] ?? hotspotTopics[0];
    },
    [hotspotPayload, selectedHotspotId]
  );

  useEffect(() => {
    void boot();
    // The boot sequence intentionally runs once on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (workspaceMode === "chat") {
      messageEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [messages, busy, workspaceMode]);

  async function boot() {
    setBusy("boot");
    await Promise.all([loadConversations(), loadAccounts(), loadPersonas(), loadContents(), loadHotspots()]);
    setBusy(null);
  }

  async function loadHotspots(refresh = false) {
    setHotspotLoading(true);
    setHotspotError(null);
    try {
      const data = await readJson<HotspotPayload>(
        await fetch(`/api/hotspots?limit=40${refresh ? "&refresh=1" : ""}`, { cache: "no-store" })
      );
      setHotspotPayload(data);
      setHotspotPlatform((current) => (data.platforms.includes(current) ? current : "全平台"));
      setSelectedHotspotId((current) => {
        if (data.topics.some((topic) => topic.id === current)) return current;
        return data.topics[0]?.id ?? current;
      });
    } catch (error) {
      setHotspotError(error instanceof Error ? error.message : "热点加载失败，已使用本地兜底数据");
    } finally {
      setHotspotLoading(false);
    }
  }

  async function loadConversations() {
    setBusy((current) => (current === "boot" ? current : "conversations"));
    try {
      const data = await readJson<{ conversations: Conversation[] }>(
        await fetch("/api/conversations", { cache: "no-store" })
      );
      setConversations(data.conversations);
      if (!activeConversationId && data.conversations[0]) {
        await openConversation(data.conversations[0].id, false);
      }
    } catch (error) {
      if (!isDatabaseUnavailableError(error)) {
        toast.error(error instanceof Error ? error.message : "加载对话失败");
      }
    } finally {
      setBusy((current) => (current === "conversations" ? null : current));
    }
  }

  async function loadAccounts() {
    setBusy((current) => (current === "boot" ? current : "accounts"));
    try {
      const data = await readJson<{ accounts: BenchmarkAccount[] }>(
        await fetch("/api/benchmark/accounts", { cache: "no-store" })
      );
      setAccounts(data.accounts);
      setSelectedIds((current) =>
        current.filter((id) => data.accounts.some((account) => account.id === id))
      );
    } catch (error) {
      if (!isDatabaseUnavailableError(error)) {
        toast.error(error instanceof Error ? error.message : "加载账号失败");
      }
    } finally {
      setBusy((current) => (current === "accounts" ? null : current));
    }
  }

  async function loadPersonas() {
    setBusy((current) => (current === "boot" ? current : "personas"));
    try {
      const data = await readJson<{ personas: Persona[] }>(
        await fetch("/api/persona", { cache: "no-store" })
      );
      setPersonas(data.personas);
    } catch (error) {
      if (!isDatabaseUnavailableError(error)) {
        toast.error(error instanceof Error ? error.message : "加载人设失败");
      }
    } finally {
      setBusy((current) => (current === "personas" ? null : current));
    }
  }

  async function loadContents() {
    try {
      const data = await readJson<{ contents: GeneratedContent[] }>(
        await fetch("/api/content/list", { cache: "no-store" })
      );
      setContents(data.contents);
    } catch {
      setContents([]);
    }
  }

  async function createConversation(seed?: string) {
    setBusy("conversations");
    try {
      const data = await readJson<{ conversation: Conversation }>(
        await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: seed ?? "新的创作会话" }),
        })
      );
      setConversations((current) => [data.conversation, ...current]);
      setActiveConversationId(data.conversation.id);
      setMessages(initialMessages);
      setMobileSidebarOpen(false);
      return data.conversation.id;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "新建对话失败");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function openConversation(id: string, closeMobile = true) {
    if (id.startsWith("seed-")) {
      setActiveConversationId(id);
      setMessages(initialMessages);
      if (closeMobile) setMobileSidebarOpen(false);
      return;
    }
    setBusy("conversations");
    try {
      const data = await readJson<{ conversation: Conversation }>(
        await fetch(`/api/conversations/${id}`, { cache: "no-store" })
      );
      setActiveConversationId(id);
      setMessages(data.conversation.messages?.length ? data.conversation.messages : initialMessages);
      if (closeMobile) setMobileSidebarOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "打开对话失败");
    } finally {
      setBusy(null);
    }
  }

  async function deleteConversation(id: string) {
    if (id.startsWith("seed-")) {
      toast.info("示例对话不会删除");
      return;
    }
    setBusy("delete");
    try {
      await readJson<{ success: boolean }>(
        await fetch(`/api/conversations/${id}`, { method: "DELETE" })
      );
      setConversations((current) => current.filter((conversation) => conversation.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages(initialMessages);
      }
      toast.success("对话已删除");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除对话失败");
    } finally {
      setBusy(null);
    }
  }

  async function sendMessage(rawMessage?: string) {
    const message = (rawMessage ?? composer).trim();
    if (!message) return;

    let conversationId = activeConversationId;
    if (!conversationId || conversationId.startsWith("seed-")) {
      conversationId = await createConversation(message);
      if (!conversationId) return;
    }

    const userMessage: ConversationMessage = {
      id: `local-user-${Date.now()}`,
      role: "user",
      content: message,
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, userMessage]);
    setComposer("");
    setBusy("send");

    try {
      const data = await readJson<ChatResponse>(
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            message,
            selectedBenchmarkAccountIds: selectedAccountIds,
            selectedPersonaId: defaultPersona?.id,
          }),
        })
      );
      const assistantMessage: ConversationMessage = {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        content: data.message,
        metadata: data.artifact,
        createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, assistantMessage]);

      if (data.intent === "add_benchmark_account") {
        await loadAccounts();
        const accountId = readArtifactAccountId(data.artifact);
        if (accountId) {
          setSelectedIds((current) => Array.from(new Set([...current, accountId])));
        }
      }
      if (data.intent === "generate_content") {
        const contentId = readArtifactContentId(data.artifact);
        setLatestDraft({ id: contentId, markdown: data.message });
        await loadContents();
      }
      if (data.intent === "analyze_account" || data.intent === "generate_report") {
        toast.success("分析已生成");
      }
      await loadConversations();
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "发送失败";
      setMessages((current) => [
        ...current,
        {
          id: `local-error-${Date.now()}`,
          role: "assistant",
          content: `这次请求失败：${errorText}`,
          createdAt: new Date().toISOString(),
        },
      ]);
      toast.error(errorText);
    } finally {
      setBusy(null);
    }
  }

  async function handleQuickAction(value: string) {
    if (value === "__save_latest__") {
      await saveLatestDraft();
      return;
    }
    setComposer(value);
    await sendMessage(value);
  }

  async function saveLatestDraft() {
    if (!latestDraft?.markdown) {
      toast.error("当前没有可保存的草稿");
      return;
    }
    setBusy("save");
    try {
      await readJson<{ content: GeneratedContent }>(
        await fetch("/api/content/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentId: latestDraft.id,
            fullMarkdown: latestDraft.markdown,
            status: "saved",
          }),
        })
      );
      await loadContents();
      toast.success("草稿已保存");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存草稿失败");
    } finally {
      setBusy(null);
    }
  }

  async function copyLatestDraft() {
    if (!latestDraft?.markdown) {
      toast.error("当前没有可复制的草稿");
      return;
    }
    await navigator.clipboard.writeText(latestDraft.markdown);
    toast.success("草稿已复制");
  }

  function toggleAccount(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  }

  function handleHotspotPlatformChange(platform: HotspotPlatform) {
    setHotspotPlatform(platform);
    const topics = hotspotPayload?.topics?.length ? hotspotPayload.topics : hotspotTopics;
    const firstTopic = filterHotspotsByPlatform(platform, topics)[0];
    if (firstTopic) setSelectedHotspotId(firstTopic.id);
  }

  async function generateHotspotTopic(angleTitle?: string) {
    const prompt = angleTitle
      ? `/content 围绕热点「${selectedHotspot.title}」，角度「${angleTitle}」，生成一篇小红书图文选题、标题和正文草稿`
      : `/content 围绕热点「${selectedHotspot.title}」生成 3 个小红书选题方向，并给出最推荐的一篇正文草稿`;
    setWorkspaceMode("chat");
    await sendMessage(prompt);
  }

  async function addHotspotBenchmark() {
    setWorkspaceMode("chat");
    await sendMessage(`把热点「${selectedHotspot.title}」加入对标分析，拆解代表账号、内容结构和可复用选题角度`);
  }

  return (
    <main
      className={cn(
        "h-screen overflow-hidden",
        workspaceMode === "hotspots" ? "bg-[#05070d] text-slate-100" : "bg-[#f4f4f2] text-[#171717]"
      )}
    >
      <div className="flex h-full">
        <ChatSidebar
          workspaceMode={workspaceMode}
          activeConversationId={activeConversationId}
          groupedConversations={groupedConversations}
          search={conversationSearch}
          busy={busy}
          mobileOpen={mobileSidebarOpen}
          onWorkspaceModeChange={setWorkspaceMode}
          onSearchChange={setConversationSearch}
          onNewChat={() => {
            setWorkspaceMode("chat");
            void createConversation();
          }}
          onOpen={(id) => {
            setWorkspaceMode("chat");
            void openConversation(id);
          }}
          onDelete={deleteConversation}
          onCloseMobile={() => setMobileSidebarOpen(false)}
        />

        <section className={cn("flex min-w-0 flex-1 flex-col", workspaceMode === "hotspots" ? "bg-[#05070d]" : "bg-white")}>
          <TopBar
            title={
              workspaceMode === "hotspots"
                ? "热点雷达"
                : activeConversation
                  ? getConversationTitle(activeConversation)
                  : "对标账号分析：大学生成长赛道"
            }
            subtitle={
              workspaceMode === "hotspots"
                ? `${hotspotPlatform} · ${hotspotWindow}窗口 · ${selectedHotspot.title} · ${
                    hotspotPayload?.summary.activeSources ?? 0
                  } 个来源`
                : `本地工作区 · ${selectedAccounts.length} 个对标账号已选 · 对话驱动`
            }
            tone={workspaceMode}
            selectedCount={selectedAccounts.length}
            onOpenSidebar={() => setMobileSidebarOpen(true)}
            onToggleInspector={() => setInspectorOpen((open) => !open)}
          />

          <div className="flex min-h-0 flex-1">
            {workspaceMode === "hotspots" ? (
              <>
                <HotspotRadarDashboard
                  selectedHotspot={selectedHotspot}
                  platform={hotspotPlatform}
                  window={hotspotWindow}
                  topics={hotspotPayload?.topics}
                  platforms={hotspotPayload?.platforms}
                  sourceHealth={hotspotPayload?.sourceHealth}
                  generatedAt={hotspotPayload?.generatedAt}
                  loading={hotspotLoading}
                  error={hotspotError}
                  onPlatformChange={handleHotspotPlatformChange}
                  onWindowChange={setHotspotWindow}
                  onSelectHotspot={setSelectedHotspotId}
                  onGenerateTopic={(angleTitle) => void generateHotspotTopic(angleTitle)}
                  onAddBenchmark={() => void addHotspotBenchmark()}
                  onRefresh={() => void loadHotspots(true)}
                />
                <HotspotOpportunityPanel
                  open={inspectorOpen}
                  selectedHotspot={selectedHotspot}
                  onGenerateTopic={(angleTitle) => void generateHotspotTopic(angleTitle)}
                  onAddBenchmark={() => void addHotspotBenchmark()}
                />
              </>
            ) : (
              <>
                <div className="flex min-w-0 flex-1 flex-col bg-[#fbfbfa]">
                  <ChatThread
                    messages={messages}
                    busy={busy}
                    onCopyDraft={copyLatestDraft}
                    onSaveDraft={saveLatestDraft}
                  />
                  <div ref={messageEndRef} />
                  <ChatComposer
                    value={composer}
                    busy={busy}
                    quickActions={quickActions}
                    onChange={setComposer}
                    onSend={() => void sendMessage()}
                    onQuickAction={(value) => void handleQuickAction(value)}
                  />
                </div>

                <RightInspector
                  open={inspectorOpen}
                  accounts={visibleAccounts}
                  selectedIds={selectedAccountIds}
                  selectedAccounts={selectedAccounts}
                  persona={defaultPersona}
                  contents={contents}
                  latestDraft={latestDraft}
                  busy={busy}
                  onToggleAccount={toggleAccount}
                  onCopyDraft={copyLatestDraft}
                  onSaveDraft={saveLatestDraft}
                />
              </>
            )}
          </div>
        </section>
      </div>

      <span className="sr-only">Concept reference: {conceptPath}</span>
    </main>
  );
}

function readArtifactAccountId(artifact: unknown) {
  if (!artifact || typeof artifact !== "object") return null;
  const value = (artifact as { accountId?: unknown }).accountId;
  return typeof value === "string" ? value : null;
}

function readArtifactContentId(artifact: unknown) {
  if (!artifact || typeof artifact !== "object") return undefined;
  const value = (artifact as { contentId?: unknown }).contentId;
  return typeof value === "string" ? value : undefined;
}

function ChatSidebar(props: {
  workspaceMode: WorkspaceMode;
  activeConversationId: string | null;
  groupedConversations: Record<string, Conversation[]>;
  search: string;
  busy: BusyState;
  mobileOpen: boolean;
  onWorkspaceModeChange: (mode: WorkspaceMode) => void;
  onSearchChange: (value: string) => void;
  onNewChat: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onCloseMobile: () => void;
}) {
  const groups = ["今天", "昨天", "近 7 天", "项目"];

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/20 lg:hidden",
          props.mobileOpen ? "block" : "hidden"
        )}
        onClick={props.onCloseMobile}
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[292px] shrink-0 flex-col border-r border-[#dedede] bg-[#f7f7f5] transition-transform lg:static lg:translate-x-0",
          props.mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        data-testid="chat-sidebar"
      >
        <div className="flex h-14 items-center gap-2 border-b border-[#e6e4df] px-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#cf2f2f] text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">星迹内容助手</p>
            <p className="text-[11px] text-[#77736d]">AI conversation workspace</p>
          </div>
          <button
            type="button"
            onClick={props.onCloseMobile}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#6e6a64] hover:bg-[#eceae6] lg:hidden"
            aria-label="关闭侧边栏"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1 border-b border-[#e6e4df] px-3 py-3">
          <WorkspaceSwitchButton
            active={props.workspaceMode === "hotspots"}
            icon={<BarChart3 className="h-4 w-4" />}
            label="热点雷达"
            description="趋势、榜单、机会角度"
            onClick={() => props.onWorkspaceModeChange("hotspots")}
          />
          <WorkspaceSwitchButton
            active={props.workspaceMode === "chat"}
            icon={<MessageSquare className="h-4 w-4" />}
            label="创作对话"
            description="账号分析、图文生成"
            onClick={() => props.onWorkspaceModeChange("chat")}
          />
        </div>

        <div className="space-y-2 px-3 py-3">
          <button
            type="button"
            onClick={props.onNewChat}
            data-testid="new-chat"
            className="flex h-9 w-full items-center justify-between rounded-md bg-[#171717] px-3 text-sm font-medium text-white hover:bg-[#2b2b2b]"
          >
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              新建对话
            </span>
            {props.busy === "conversations" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <div className="flex h-9 items-center gap-2 rounded-md border border-[#dedbd4] bg-white px-2.5">
            <Search className="h-4 w-4 text-[#8b867e]" />
            <input
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
              data-testid="conversation-search"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9a958d]"
              placeholder="搜索对话"
            />
          </div>
        </div>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {groups.map((group) => {
            const items = props.groupedConversations[group] ?? [];
            if (!items.length) return null;
            return (
              <div key={group} className="mt-2">
                <div className="px-2 py-1 text-[11px] font-semibold uppercase text-[#8a867f]">
                  {group}
                </div>
                <div className="space-y-1">
                  {items.map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      active={props.workspaceMode === "chat" && props.activeConversationId === conversation.id}
                      pinned={conversation.id.startsWith("seed-pinned")}
                      onOpen={() => props.onOpen(conversation.id)}
                      onDelete={() => props.onDelete(conversation.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-[#e6e4df] p-3">
          <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm text-[#55514b] hover:bg-[#eceae6]"
          >
            <Archive className="h-4 w-4" />
            归档与设置
          </button>
        </div>
      </aside>
    </>
  );
}

function WorkspaceSwitchButton(props: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition",
        props.active
          ? "bg-[#171717] text-white shadow-sm"
          : "text-[#55514b] hover:bg-[#eceae6]"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          props.active ? "bg-cyan-300/15 text-cyan-200" : "bg-white text-[#77736d]"
        )}
      >
        {props.icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{props.label}</span>
        <span className={cn("block truncate text-[11px]", props.active ? "text-slate-400" : "text-[#8b867e]")}>
          {props.description}
        </span>
      </span>
    </button>
  );
}

function ConversationRow(props: {
  conversation: Conversation;
  active: boolean;
  pinned: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 rounded-md px-2 py-2",
        props.active ? "bg-white shadow-sm ring-1 ring-[#dedbd4]" : "hover:bg-[#eceae6]"
      )}
      data-testid={props.active ? "active-conversation" : undefined}
    >
      <button type="button" onClick={props.onOpen} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              props.active ? "bg-[#cf2f2f]" : "bg-[#b8b3ab]"
            )}
          />
          <p className="truncate text-[13px] font-medium text-[#252321]">
            {getConversationTitle(props.conversation)}
          </p>
          {props.pinned && <Pin className="h-3 w-3 shrink-0 text-[#b4473d]" />}
        </div>
        <p className="mt-0.5 truncate pl-3.5 text-[11px] text-[#8b867e]">
          {formatTime(props.conversation.updatedAt)}
          {props.conversation.messages?.[0]?.content
            ? ` · ${props.conversation.messages[0].content}`
            : ""}
        </p>
      </button>
      <button
        type="button"
        onClick={props.onDelete}
        className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#77736d] hover:bg-[#e1dfd9] group-hover:inline-flex"
        aria-label="删除对话"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TopBar(props: {
  title: string;
  subtitle: string;
  tone: WorkspaceMode;
  selectedCount: number;
  onOpenSidebar: () => void;
  onToggleInspector: () => void;
}) {
  const cyber = props.tone === "hotspots";

  return (
    <header
      className={cn(
        "flex h-14 items-center justify-between border-b px-3 lg:px-5",
        cyber ? "border-cyan-300/15 bg-[#05070d] text-slate-100" : "border-[#e6e4df] bg-white"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={props.onOpenSidebar}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md lg:hidden",
            cyber ? "text-slate-300 hover:bg-cyan-300/10" : "text-[#5f5a54] hover:bg-[#f0efeb]"
          )}
          aria-label="打开侧边栏"
        >
          <Menu className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className={cn("truncate text-sm font-semibold", cyber ? "text-white" : "text-[#20201e]")}>
            {props.title}
          </h1>
          <p className={cn("truncate text-[11px]", cyber ? "text-slate-500" : "text-[#77736d]")}>{props.subtitle}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <IconButton label="分享" cyber={cyber} icon={<Share2 className="h-4 w-4" />} />
        <IconButton label="历史" cyber={cyber} icon={<History className="h-4 w-4" />} />
        <IconButton label="设置" cyber={cyber} icon={<Settings className="h-4 w-4" />} />
        <button
          type="button"
          onClick={props.onToggleInspector}
          data-testid="toggle-inspector"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-md border",
            cyber
              ? "border-cyan-300/25 bg-[#0b1220] text-cyan-200 hover:bg-cyan-300/10"
              : "border-[#dedbd4] bg-white text-[#5f5a54] hover:bg-[#f4f3ef]"
          )}
          aria-label="切换右侧面板"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}

function IconButton(props: { label: string; cyber?: boolean; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "hidden h-8 w-8 items-center justify-center rounded-md sm:inline-flex",
        props.cyber ? "text-slate-400 hover:bg-cyan-300/10 hover:text-cyan-200" : "text-[#5f5a54] hover:bg-[#f4f3ef]"
      )}
      aria-label={props.label}
      title={props.label}
    >
      {props.icon}
    </button>
  );
}

function ChatThread(props: {
  messages: ConversationMessage[];
  busy: BusyState;
  onCopyDraft: () => void;
  onSaveDraft: () => void;
}) {
  return (
    <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-lg border border-[#e4e1da] bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#cf2f2f] text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">通过对话完成整个工作流</p>
              <p className="mt-1 text-sm leading-6 text-[#68635d]">
                粘贴账号或输入需求后，我会把识别、分析、图文生成、保存草稿都组织成可继续操作的消息卡片。
              </p>
            </div>
          </div>
        </div>

        {props.messages.map((message) => (
          <MessageBlock
            key={message.id}
            message={message}
            onCopyDraft={props.onCopyDraft}
            onSaveDraft={props.onSaveDraft}
          />
        ))}

        {props.busy === "send" && (
          <div className="flex items-center gap-3 rounded-lg border border-[#e4e1da] bg-white p-4 text-sm text-[#68635d]">
            <Loader2 className="h-4 w-4 animate-spin text-[#cf2f2f]" />
            正在处理对话请求...
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBlock(props: {
  message: ConversationMessage;
  onCopyDraft: () => void;
  onSaveDraft: () => void;
}) {
  const isUser = props.message.role === "user";
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[78%] rounded-lg bg-[#171717] px-4 py-3 text-sm leading-6 text-white">
          {props.message.content}
        </div>
      </div>
    );
  }

  const artifactKind = inferArtifactKind(props.message);
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#e4e1da] bg-white text-[#cf2f2f]">
        <Bot className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <ArtifactCard
          kind={artifactKind}
          content={props.message.content}
          createdAt={props.message.createdAt}
          onCopyDraft={props.onCopyDraft}
          onSaveDraft={props.onSaveDraft}
        />
      </div>
    </div>
  );
}

function ArtifactCard(props: {
  kind: "account" | "analysis" | "draft" | "text";
  content: string;
  createdAt: string;
  onCopyDraft: () => void;
  onSaveDraft: () => void;
}) {
  const meta = {
    account: {
      title: "已识别小红书账号",
      icon: <Check className="h-4 w-4" />,
      color: "text-[#27704f]",
    },
    analysis: {
      title: "对标分析摘要",
      icon: <BarChart3 className="h-4 w-4" />,
      color: "text-[#214d45]",
    },
    draft: {
      title: "图文草稿已生成",
      icon: <FileText className="h-4 w-4" />,
      color: "text-[#cf2f2f]",
    },
    text: {
      title: "助手回复",
      icon: <MessageSquare className="h-4 w-4" />,
      color: "text-[#68635d]",
    },
  }[props.kind];

  return (
    <article className="rounded-lg border border-[#e4e1da] bg-white shadow-sm" data-testid={`artifact-${props.kind}`}>
      <div className="flex items-center justify-between border-b border-[#eeecea] px-4 py-3">
        <div className={cn("flex items-center gap-2 text-sm font-semibold", meta.color)}>
          {meta.icon}
          {meta.title}
        </div>
        <span className="text-[11px] text-[#8b867e]">{formatTime(props.createdAt)}</span>
      </div>
      <div className="markdown-body max-h-[420px] overflow-y-auto px-4 py-3 text-[#26231f]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{props.content}</ReactMarkdown>
      </div>
      {props.kind === "draft" && (
        <div className="flex items-center gap-2 border-t border-[#eeecea] px-4 py-3">
          <button
            type="button"
            onClick={props.onCopyDraft}
            className="inline-flex h-8 items-center gap-2 rounded-md border border-[#dedbd4] px-2.5 text-xs font-medium hover:bg-[#f4f3ef]"
          >
            <Copy className="h-3.5 w-3.5" />
            复制草稿
          </button>
          <button
            type="button"
            onClick={props.onSaveDraft}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-[#cf2f2f] px-2.5 text-xs font-medium text-white hover:bg-[#b42828]"
          >
            <FileText className="h-3.5 w-3.5" />
            保存草稿
          </button>
        </div>
      )}
    </article>
  );
}

function ChatComposer(props: {
  value: string;
  busy: BusyState;
  quickActions: typeof quickActions;
  onChange: (value: string) => void;
  onSend: () => void;
  onQuickAction: (value: string) => void;
}) {
  return (
    <div className="border-t border-[#e6e4df] bg-white px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-2 flex flex-wrap gap-2">
          {props.quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => props.onQuickAction(action.value)}
              disabled={props.busy === "send" || props.busy === "save"}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#dedbd4] bg-[#fbfbfa] px-2.5 text-xs font-medium text-[#55514b] hover:bg-[#f1efeb] disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#cf2f2f]" />
              {action.label}
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-[#d8d5ce] bg-white p-2 shadow-sm focus-within:border-[#cf2f2f]">
          <textarea
            value={props.value}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                props.onSend();
              }
            }}
            data-testid="chat-composer"
            className="min-h-[76px] w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-[#9a958d]"
            placeholder="粘贴小红书链接、输入主题，或直接说你想生成什么"
          />
          <div className="flex items-center justify-between border-t border-[#efede8] pt-2">
            <div className="flex items-center gap-2 text-xs text-[#817c74]">
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[#f4f3ef]"
                aria-label="附加资料"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <span>/ 命令 · Shift Enter 换行</span>
            </div>
            <button
              type="button"
              onClick={props.onSend}
              disabled={props.busy === "send" || !props.value.trim()}
              data-testid="send-message"
              className="inline-flex h-8 items-center gap-2 rounded-md bg-[#cf2f2f] px-3 text-xs font-semibold text-white hover:bg-[#b42828] disabled:cursor-not-allowed disabled:bg-[#d8d5ce]"
            >
              {props.busy === "send" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              发送
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RightInspector(props: {
  open: boolean;
  accounts: BenchmarkAccount[];
  selectedIds: string[];
  selectedAccounts: BenchmarkAccount[];
  persona?: Persona;
  contents: GeneratedContent[];
  latestDraft: { id?: string; markdown: string } | null;
  busy: BusyState;
  onToggleAccount: (id: string) => void;
  onCopyDraft: () => void;
  onSaveDraft: () => void;
}) {
  return (
    <aside
      className={cn(
        "hidden w-[330px] shrink-0 border-l border-[#e6e4df] bg-white xl:flex xl:flex-col",
        !props.open && "xl:hidden"
      )}
      data-testid="right-inspector"
    >
      <div className="flex h-14 items-center justify-between border-b border-[#e6e4df] px-4">
        <div>
          <p className="text-sm font-semibold">上下文</p>
          <p className="text-[11px] text-[#817c74]">账号、人设、草稿</p>
        </div>
        <MoreHorizontal className="h-4 w-4 text-[#817c74]" />
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <InspectorSection title="已选对标账号" count={props.selectedIds.length}>
          <div className="space-y-2">
            {props.accounts.length ? (
              props.accounts.slice(0, 8).map((account) => {
                const selected = props.selectedIds.includes(account.id);
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => props.onToggleAccount(account.id)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left",
                      selected
                        ? "border-[#cf2f2f] bg-[#fff7f6]"
                        : "border-[#e7e4de] bg-[#fbfbfa] hover:bg-[#f4f3ef]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        selected
                          ? "border-[#cf2f2f] bg-[#cf2f2f] text-white"
                          : "border-[#cfcac1] bg-white"
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">
                        {getAccountLabel(account)}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-[#746f68]">
                        {account.description ?? account.category ?? "暂无简介"}
                      </span>
                    </span>
                  </button>
                );
              })
            ) : (
              <EmptyLine text="通过对话添加第一个对标账号。" />
            )}
          </div>
        </InspectorSection>

        <InspectorSection title="当前人设">
          {props.persona ? (
            <div className="rounded-md border border-[#e7e4de] bg-[#fbfbfa] p-3">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-[#cf2f2f]" />
                <p className="truncate text-sm font-semibold">
                  {props.persona.name ?? "默认创作者"}
                </p>
              </div>
              <p className="mt-2 text-xs leading-5 text-[#6e6962]">
                {props.persona.niche ?? props.persona.creatorIdentity ?? "尚未配置细分赛道。"}
              </p>
              <p className="mt-2 text-[11px] leading-4 text-[#8b867e]">
                {props.persona.targetAudience ?? props.persona.contentStyle ?? "建议补充目标受众和表达风格。"}
              </p>
            </div>
          ) : (
            <EmptyLine text="暂无人设。可在对话里输入“配置人设”。" />
          )}
        </InspectorSection>

        <InspectorSection title="最新草稿">
          {props.latestDraft?.markdown ? (
            <div className="rounded-md border border-[#e7e4de] bg-[#fbfbfa] p-3">
              <div className="line-clamp-6 whitespace-pre-wrap text-xs leading-5 text-[#38342f]">
                {props.latestDraft.markdown}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={props.onCopyDraft}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-[#dedbd4] text-xs font-medium hover:bg-white"
                >
                  <Copy className="h-3.5 w-3.5" />
                  复制
                </button>
                <button
                  type="button"
                  onClick={props.onSaveDraft}
                  disabled={props.busy === "save"}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#cf2f2f] text-xs font-medium text-white hover:bg-[#b42828] disabled:opacity-60"
                >
                  {props.busy === "save" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  保存
                </button>
              </div>
            </div>
          ) : (
            <EmptyLine text="生成图文后会显示草稿预览。" />
          )}
        </InspectorSection>

        <InspectorSection title="内容历史" count={props.contents.length}>
          <div className="space-y-2">
            {props.contents.slice(0, 5).map((content) => (
              <div key={content.id} className="rounded-md border border-[#e7e4de] bg-[#fbfbfa] p-2.5">
                <p className="truncate text-xs font-semibold">{content.title ?? "未命名内容"}</p>
                <p className="mt-1 text-[11px] text-[#8b867e]">
                  {content.status} · {formatTime(content.updatedAt)}
                </p>
              </div>
            ))}
            {!props.contents.length && <EmptyLine text="暂无保存内容。" />}
          </div>
        </InspectorSection>
      </div>
    </aside>
  );
}

function InspectorSection(props: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase text-[#6e6962]">{props.title}</h2>
        {typeof props.count === "number" && (
          <span className="rounded bg-[#f1efeb] px-1.5 py-0.5 text-[11px] text-[#746f68]">
            {props.count}
          </span>
        )}
      </div>
      {props.children}
    </section>
  );
}

function EmptyLine(props: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-[#d9d5ce] bg-[#fbfbfa] p-3 text-xs leading-5 text-[#817c74]">
      {props.text}
    </div>
  );
}
