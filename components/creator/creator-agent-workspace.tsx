"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CreatorShell } from "@/components/creator/creator-shell";
import { ConversationSidebar } from "@/components/creator/conversation-sidebar";
import {
  ConversationThread,
  type QuickEntry,
} from "@/components/creator/conversation-thread";
import {
  CreatorComposer,
  type ComposerContextChip,
} from "@/components/creator/creator-composer";
import type { InvokeCardAction } from "@/components/creator/cards/card-renderer";
import {
  actionKeyOf,
  cancelRun,
  createConversation,
  getContentContext,
  invokeAction,
  listConversations,
  listMessages,
  sendMessage,
  type ActiveRun,
  type ConversationSummary,
  type ThreadMessage,
} from "@/lib/creator/conversation-client";

type Platform = "xiaohongshu" | "douyin";

const PLATFORM_LABEL: Record<Platform, string> = {
  xiaohongshu: "小红书",
  douyin: "抖音",
};

function quickEntriesFor(platform: Platform): QuickEntry[] {
  return [
    {
      id: "from-ideas",
      label: "从选题库开始",
      hint: "挑一个已收藏的选题进入创作",
      icon: "idea",
      kind: "link",
      href: "/ideas",
    },
    {
      id: "import-reference",
      label: "导入参考作品",
      hint: "粘贴公开或已授权的作品链接",
      icon: "import",
      kind: "prefill",
      prefill: "帮我导入这个参考作品链接:",
    },
    {
      id: "write-xhs",
      label: "写一篇小红书图文",
      hint: "描述主题和目标读者即可",
      icon: "xhs",
      kind: "prefill",
      prefill: "帮我写一篇小红书图文,主题是",
    },
    {
      id: "write-douyin",
      label: "生成抖音口播脚本",
      hint: "说明视频目标和预期时长",
      icon: "douyin",
      kind: "prefill",
      prefill: "帮我生成一个抖音口播脚本,主题是",
    },
  ].sort((a, b) => {
    const weight = (entry: { id: string }) =>
      entry.id === (platform === "douyin" ? "write-douyin" : "write-xhs") ? -1 : 0;
    return weight(a) - weight(b);
  }) as QuickEntry[];
}

export function CreatorAgentWorkspace({ platform }: { platform: Platform }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversationId");
  const contentId = searchParams.get("contentId");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [processedKeys, setProcessedKeys] = useState<string[]>([]);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [threadState, setThreadState] = useState<"empty" | "loading" | "ready" | "error">(
    conversationId ? "loading" : "empty",
  );
  const [threadError, setThreadError] = useState<string | undefined>(undefined);
  const [composerValue, setComposerValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState<ComposerContextChip[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const localEchoRef = useRef(0);
  const busyRef = useRef(false);

  const refreshList = useCallback(async () => {
    try {
      setConversations(await listConversations());
    } catch {
      // 列表加载失败不阻塞主流程;侧栏显示空态。
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const reloadMessages = useCallback(
    async (id: string) => {
      const data = await listMessages(id);
      // 服务端为真相源;仅保留尚未持久化的本地回显(失败提示等),避免覆盖
      setMessages((previous) => {
        const locals = previous.filter((message) => message.id.startsWith("local-"));
        return [...data.messages, ...locals];
      });
      setProcessedKeys(data.processedActionKeys);
      setActiveRun(data.activeRun);
      return data;
    },
    [],
  );

  // URL -> 会话恢复(pending/failed 状态直接来自数据库)。
  // 发送期间跳过:懒创建会触发 URL 变化,发送流程自己负责落地消息,避免竞态清空本地回显。
  useEffect(() => {
    let cancelled = false;
    if (!conversationId) {
      setMessages([]);
      setProcessedKeys([]);
      setActiveRun(null);
      setThreadState("empty");
      setThreadError(undefined);
      return;
    }
    if (busyRef.current) return;
    setThreadState("loading");
    reloadMessages(conversationId)
      .then(() => {
        if (!cancelled) setThreadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setThreadState("error");
        setThreadError(
          error instanceof Error ? error.message : "会话不存在,或不属于当前账号。",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, reloadMessages]);

  // /ideas 带入的内容项目 -> 上下文 Chip
  useEffect(() => {
    let cancelled = false;
    if (!contentId) {
      setChips((current) => current.filter((chip) => chip.kind !== "content"));
      return;
    }
    getContentContext(contentId)
      .then((content) => {
        if (cancelled) return;
        setChips([
          { id: content.id, kind: "content", label: content.title || "未命名项目" },
        ]);
      })
      .catch(() => {
        if (!cancelled) setChips([]);
      });
    return () => {
      cancelled = true;
    };
  }, [contentId]);

  const navigate = useCallback(
    (
      nextPlatform: Platform,
      params: { conversationId?: string | null; contentId?: string | null },
    ) => {
      const query = new URLSearchParams();
      if (params.conversationId) query.set("conversationId", params.conversationId);
      if (params.contentId) query.set("contentId", params.contentId);
      const suffix = query.toString();
      router.push(`/creator/${nextPlatform}${suffix ? `?${suffix}` : ""}`);
    },
    [router],
  );

  const submitText = useCallback(
    async (text: string) => {
      if (!text || busy) return;
      setBusy(true);
      busyRef.current = true;

      const echoId = `local-user-${++localEchoRef.current}`;
      setMessages((current) => [
        ...current,
        {
          id: echoId,
          role: "user",
          content: text,
          status: "complete",
          cards: [],
          createdAt: new Date().toISOString(),
          clientMessageId: null,
        },
      ]);
      setThreadState("ready");

      try {
        let activeId = conversationId;
        if (!activeId) {
          // 懒创建:首条消息时才建会话
          const created = await createConversation(text.slice(0, 48));
          activeId = created.id;
          const query = new URLSearchParams(searchParams.toString());
          query.set("conversationId", created.id);
          router.replace(`${pathname}?${query.toString()}`, { scroll: false });
        }
        const result = await sendMessage(activeId, text);
        setMessages((current) => [
          ...current.filter((message) => message.id !== echoId),
          result.userMessage,
          result.assistantMessage,
        ]);
        void refreshList();
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            id: `local-assistant-${++localEchoRef.current}`,
            role: "assistant",
            content: `请求未完成:${error instanceof Error ? error.message : "未知错误"}`,
            status: "failed",
            cards: [],
            createdAt: new Date().toISOString(),
            clientMessageId: null,
          },
        ]);
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [busy, conversationId, pathname, refreshList, router, searchParams],
  );

  async function handleSend() {
    const text = composerValue.trim();
    if (!text) return;
    setComposerValue("");
    await submitText(text);
  }

  const handleInvokeAction: InvokeCardAction = async (params) => {
    if (!conversationId) throw new Error("会话尚未创建。");
    const result = await invokeAction(conversationId, params);
    setMessages((current) =>
      current.some((message) => message.id === result.resultMessage.id)
        ? current
        : [...current, result.resultMessage],
    );
    setProcessedKeys((current) => {
      const key = actionKeyOf(params.cardId, params.actionId);
      const clientKey = result.resultMessage.clientMessageId;
      const next = new Set(current);
      next.add(key);
      if (clientKey) next.add(clientKey);
      return [...next];
    });
  };

  function handleRetry(message: ThreadMessage) {
    if (message.role === "user" && message.content) {
      void submitText(message.content);
    }
  }

  async function handleCancelRun(runId: string) {
    try {
      await cancelRun(runId);
    } finally {
      if (conversationId) void reloadMessages(conversationId);
    }
  }

  function handleQuickEntry(entry: QuickEntry) {
    if (entry.kind === "link" && entry.href) {
      router.push(entry.href);
      return;
    }
    if (entry.prefill) {
      setComposerValue(entry.prefill);
      document
        .querySelector<HTMLTextAreaElement>('textarea[aria-label="创作输入框"]')
        ?.focus();
    }
  }

  function handleStartNew() {
    setComposerValue("");
    navigate(platform, { contentId });
  }

  const conversationTitle =
    conversations.find((conversation) => conversation.id === conversationId)?.title ?? null;

  const topbar = (
    <div className="flex min-w-0 items-center gap-2">
      <h1 className="truncate text-sm font-semibold tracking-tight">
        {threadState === "ready" && conversationTitle
          ? conversationTitle
          : `${PLATFORM_LABEL[platform]}创作`}
      </h1>
      <span className="shrink-0 rounded-lg border border-[#DDD7CE] bg-[#FFFDF9] px-1.5 py-0.5 text-[11px] text-[#746F67]">
        {PLATFORM_LABEL[platform]}
      </span>
      {busy ? (
        <span className="shrink-0 text-[11px] text-[#C83B32]">生成中</span>
      ) : null}
    </div>
  );

  return (
    <CreatorShell
      sidebar={
        <ConversationSidebar
          conversations={conversations}
          activeId={conversationId}
          loading={listLoading}
          onSelect={(id) => {
            setDrawerOpen(false);
            navigate(platform, { conversationId: id, contentId });
          }}
          onNew={() => {
            setDrawerOpen(false);
            handleStartNew();
          }}
        />
      }
      topbar={topbar}
      composer={
        <CreatorComposer
          platform={platform}
          value={composerValue}
          busy={busy}
          chips={chips}
          onChange={setComposerValue}
          onSend={() => void handleSend()}
          onRemoveChip={(id) => {
            setChips((current) => current.filter((chip) => chip.id !== id));
            if (contentId === id) {
              navigate(platform, { conversationId });
            }
          }}
          onSwitchPlatform={(next) => navigate(next, { conversationId, contentId })}
        />
      }
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={setDrawerOpen}
    >
      <ConversationThread
        messages={messages}
        state={threadState}
        errorMessage={threadError}
        busy={busy}
        processedKeys={processedKeys}
        activeRun={activeRun}
        quickEntries={quickEntriesFor(platform)}
        onQuickEntry={handleQuickEntry}
        onStartNew={handleStartNew}
        onInvokeAction={handleInvokeAction}
        onRetry={handleRetry}
        onCancelRun={(runId) => void handleCancelRun(runId)}
      />
    </CreatorShell>
  );
}
