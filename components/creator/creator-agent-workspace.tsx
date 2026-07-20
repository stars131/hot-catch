"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  ArtifactPanel,
  type ArtifactPendingInsert,
  type ArtifactRefineRequest,
} from "@/components/creator/artifact/artifact-panel";
import type {
  ArtifactCard,
  PatchCard,
  PublishReadinessCard,
} from "@/lib/creator/chat-protocol";
import type { PatchTarget } from "@/lib/creator/chat-schemas";
import type { SkillCatalogItem } from "@/lib/skills/catalog";
import { missingItemsPrompt } from "@/lib/creator/publish-readiness";
import { useConversationEvents } from "@/hooks/creator/use-conversation-events";
import {
  actionKeyOf,
  cancelRun,
  createConversation,
  getContentContext,
  invokeAction,
  listConversations,
  listMessages,
  listSkills,
  sendMessage,
  type ActiveRun,
  type ConversationSummary,
  type ConversationCheckpoint,
  type RunTrace,
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

export function CreatorAgentWorkspace({
  platform,
  global = false,
}: {
  platform: Platform;
  global?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversationId");
  const contentId = searchParams.get("contentId");
  const prefill = searchParams.get("prefill");

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [processedKeys, setProcessedKeys] = useState<string[]>([]);
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [runTraces, setRunTraces] = useState<RunTrace[]>([]);
  const [checkpoints, setCheckpoints] = useState<ConversationCheckpoint[]>([]);
  const [threadState, setThreadState] = useState<"empty" | "loading" | "ready" | "error">(
    conversationId ? "loading" : "empty",
  );
  const [threadError, setThreadError] = useState<string | undefined>(undefined);
  const [composerValue, setComposerValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState<ComposerContextChip[]>([]);
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [contextUsage, setContextUsage] = useState<{ ratio: number; tokens: number; contextWindow: number; checkpointCount: number } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [artifactContentId, setArtifactContentId] = useState<string | null>(null);
  const [openArtifacts, setOpenArtifacts] = useState<Array<{ id: string; title: string }>>([]);
  const [lastArtifactContentId, setLastArtifactContentId] = useState<string | null>(null);
  /** 选中区块修改目标:发送消息时随 context 提交,服务端生成补丁提案卡 */
  const [patchTarget, setPatchTarget] = useState<(PatchTarget & { label: string }) | null>(
    null,
  );
  const [pendingInsert, setPendingInsert] = useState<ArtifactPendingInsert | null>(null);
  /** 就绪卡「打开检查清单」请求;仅对同一内容生效,面板据 nonce 打开一次 */
  const [checklistRequest, setChecklistRequest] = useState<{
    contentId: string;
    nonce: number;
  } | null>(null);
  const insertNonceRef = useRef(0);
  const checklistNonceRef = useRef(0);
  const seenArtifactCardIdsRef = useRef<Set<string> | null>(null);
  const localEchoRef = useRef(0);
  const busyRef = useRef(false);
  const queryClient = useQueryClient();

  const refreshList = useCallback(async (force = false) => {
    const queryKey = ["workspace", "creator", "conversations"] as const;
    const cached = queryClient.getQueryData<ConversationSummary[]>(queryKey);
    if (cached) {
      setConversations(cached);
      setListLoading(false);
    }
    try {
      const next = await queryClient.fetchQuery({
        queryKey,
        queryFn: listConversations,
        staleTime: force ? 0 : 60 * 1000,
      });
      setConversations(next);
    } catch {
      // 列表加载失败不阻塞主流程;侧栏显示空态。
    } finally {
      setListLoading(false);
    }
  }, [queryClient]);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  useEffect(() => {
    queryClient.fetchQuery({
      queryKey: ["workspace", "skills"],
      queryFn: async () => ({ skills: await listSkills() }),
      staleTime: 5 * 60 * 1000,
    })
      .then((data) => setSkills(data.skills))
      .catch(() => {
        // Skill 列表属于增强能力，加载失败时保留基础创作流程。
        setSkills([]);
      });
  }, [queryClient]);

  useEffect(() => {
    if (!prefill || conversationId) return;
    setComposerValue((current) => current || prefill.slice(0, 12000));
  }, [conversationId, prefill]);

  const reloadMessages = useCallback(
    async (id: string, force = false) => {
      const queryKey = ["workspace", "creator", "messages", id] as const;
      const cached = queryClient.getQueryData<Awaited<ReturnType<typeof listMessages>>>(queryKey);
      const data = cached ?? await queryClient.fetchQuery({
        queryKey,
        queryFn: () => listMessages(id),
        staleTime: force ? 0 : 15 * 1000,
      });
      if (!data) throw new Error("会话状态读取失败");
      // 服务端为真相源;仅保留尚未持久化的本地回显(失败提示等),避免覆盖
      setMessages((previous) => {
        const locals = previous.filter((message) => message.id.startsWith("local-"));
        return [...data.messages, ...locals];
      });
      setProcessedKeys(data.processedActionKeys);
      setActiveRun(data.activeRun);
      setRunTraces(data.runTraces);
      setCheckpoints(data.checkpoints);
      setSelectedSkillIds(data.activeSkillIds);
      if (cached && force) {
        const fresh = await queryClient.fetchQuery({
          queryKey,
          queryFn: () => listMessages(id),
          staleTime: 0,
        });
        setMessages((previous) => [
          ...fresh.messages,
          ...previous.filter((message) => message.id.startsWith("local-")),
        ]);
        setProcessedKeys(fresh.processedActionKeys);
        setActiveRun(fresh.activeRun);
        setRunTraces(fresh.runTraces);
        setCheckpoints(fresh.checkpoints);
        setSelectedSkillIds(fresh.activeSkillIds);
        return fresh;
      }
      return data;
    },
    [queryClient],
  );

  useConversationEvents(conversationId, () => {
    if (conversationId) void reloadMessages(conversationId, true);
  });

  // 切换会话时关闭 Artifact 面板,重置自动打开记录与修改目标
  useEffect(() => {
    setArtifactContentId(null);
    setLastArtifactContentId(null);
    setPatchTarget(null);
    setPendingInsert(null);
    setChecklistRequest(null);
    seenArtifactCardIdsRef.current = null;
  }, [conversationId]);

  // 新成果卡出现时自动打开 Artifact(刷新恢复的历史卡不自动打开;用户可随时关闭)
  useEffect(() => {
    if (threadState !== "ready") return;
    const cards = messages.flatMap((message) =>
      message.cards.filter((card): card is ArtifactCard => card.type === "artifact"),
    );
    if (seenArtifactCardIdsRef.current === null) {
      seenArtifactCardIdsRef.current = new Set(cards.map((card) => card.id));
      return;
    }
    const seen = seenArtifactCardIdsRef.current;
    const fresh = cards.find((card) => !seen.has(card.id));
    cards.forEach((card) => seen.add(card.id));
    if (fresh) {
      setArtifactContentId(fresh.contentId);
      setLastArtifactContentId(fresh.contentId);
    }
  }, [messages, threadState]);

  // URL -> 会话恢复(pending/failed 状态直接来自数据库)。
  // 发送期间跳过:懒创建会触发 URL 变化,发送流程自己负责落地消息,避免竞态清空本地回显。
  useEffect(() => {
    let cancelled = false;
    if (!conversationId) {
      setMessages([]);
      setProcessedKeys([]);
      setActiveRun(null);
      setRunTraces([]);
      setCheckpoints([]);
      setSelectedSkillIds([]);
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
    if (!conversationId) {
      setContextUsage(null);
      return;
    }
    fetch(`/api/conversations/${conversationId}/context`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then(setContextUsage)
      .catch(() => setContextUsage(null));
  }, [conversationId, messages.length]);

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
          { id: content.id, kind: "content", label: content.title || "未命名项目", entityType: "content" },
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
      const base = global ? "/creator" : `/creator/${nextPlatform}`;
      router.push(`${base}${suffix ? `?${suffix}` : ""}`);
    },
    [global, router],
  );

  const submitText = useCallback(
    async (
      text: string,
      options?: { publishTarget?: { contentId: string } },
    ): Promise<boolean> => {
      if (!text || busy) return false;
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
        // 选中区块修改目标只随本条消息提交一次;label 仅用于本地 Chip 展示
        const target = patchTarget
          ? {
              contentId: patchTarget.contentId,
              section: patchTarget.section,
              ...(patchTarget.excerpt ? { excerpt: patchTarget.excerpt } : {}),
              ...(patchTarget.skillId ? { skillId: patchTarget.skillId } : {}),
            }
          : undefined;
        const result = await sendMessage(activeId, text, {
          skillIds: selectedSkillIds,
          entityRefs: chips.flatMap((chip) =>
            chip.entityType ? [{ type: chip.entityType, id: chip.id }] : [],
          ),
          patchTarget: target,
          publishTarget: options?.publishTarget,
        });
        setPatchTarget(null);
        setMessages((current) => [
          ...current.filter((message) => message.id !== echoId),
          result.userMessage,
          result.assistantMessage,
        ]);
        void refreshList(true);
        return true;
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
        return false;
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    },
    [
      busy,
      conversationId,
      patchTarget,
      pathname,
      refreshList,
      router,
      searchParams,
      selectedSkillIds,
      chips,
    ],
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
    await reloadMessages(conversationId, true);
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
      if (conversationId) void reloadMessages(conversationId, true);
    }
  }

  function handleQuickEntry(entry: QuickEntry) {
    if (entry.kind === "link" && entry.href) {
      router.push(entry.href);
      return;
    }
    if (entry.prefill) {
      setComposerValue(entry.prefill);
      focusComposer();
    }
  }

  function focusComposer() {
    document
      .querySelector<HTMLTextAreaElement>('textarea[aria-label="创作输入框"]')
      ?.focus();
  }

  function handleArtifactOpen(card: ArtifactCard) {
    setArtifactContentId(card.contentId);
    setOpenArtifacts((current) => current.some((item) => item.id === card.contentId)
      ? current
      : [...current, { id: card.contentId, title: card.title }]);
    setLastArtifactContentId(card.contentId);
    setChecklistRequest(null);
    seenArtifactCardIdsRef.current?.add(card.id);
  }

  function handleArtifactRefine(card: ArtifactCard) {
    setComposerValue(`请继续优化「${card.title}」(当前 v${card.revisionNumber}):`);
    focusComposer();
  }

  /**
   * Artifact 编辑器内「让星迹修改」:预填指令并记录修改目标;
   * 发送后服务端会生成 content.propose_patch 提案卡(target 缺失时退回普通对话)。
   * <1180px 时 Artifact 全屏覆盖对话,先收起面板让用户看到输入框;
   * 桌面保持面板打开,便于边看内容边补全指令。
   */
  function handleArtifactAskRefine(request: ArtifactRefineRequest) {
    setComposerValue(request.instruction);
    setPatchTarget(
      request.target ? { ...request.target, label: request.sectionLabel } : null,
    );
    const desktop = window.matchMedia("(min-width: 1180px)").matches;
    if (!desktop) setArtifactContentId(null);
    window.setTimeout(focusComposer, desktop ? 0 : 80);
  }

  /** Composer 技能菜单:预填指令模板;已有修改目标时把 skillId 绑定到该目标。 */
  function handlePickSkill(skill: SkillCatalogItem) {
    if (!skill.composerTemplate) return;
    const sectionLabel = patchTarget?.label ?? "选中的区块";
    setComposerValue(skill.composerTemplate.replace("{section}", sectionLabel));
    setPatchTarget((current) => (current ? { ...current, skillId: skill.id } : current));
    focusComposer();
  }

  function handleToggleSkill(skillId: string) {
    setSelectedSkillIds((current) => {
      if (current.includes(skillId)) return current.filter((id) => id !== skillId);
      if (current.length >= 8) {
        toast.error("一次创作最多选择 8 个 Skill");
        return current;
      }
      return [...current, skillId];
    });
  }

  /** 补丁卡「复制到编辑器」:打开对应作品并把提案写入草稿(客户端本地)。 */
  function handlePatchCopyToEditor(card: PatchCard) {
    setArtifactContentId(card.contentId);
    setOpenArtifacts((current) => current.some((item) => item.id === card.contentId)
      ? current
      : [...current, { id: card.contentId, title: card.sectionLabel }]);
    setLastArtifactContentId(card.contentId);
    setChecklistRequest(null);
    setPendingInsert({
      nonce: ++insertNonceRef.current,
      section: card.section,
      before: card.before,
      after: card.after,
    });
  }

  /** 补丁卡「再改一次」:带同一区块上下文回到输入框。 */
  function handlePatchRefineAgain(card: PatchCard) {
    setPatchTarget({
      contentId: card.contentId,
      section: card.section,
      excerpt: card.before.slice(0, 500),
      skillId: card.skillId,
      label: card.sectionLabel,
    });
    setComposerValue(`请再修改${card.sectionLabel}:`);
    const desktop = window.matchMedia("(min-width: 1180px)").matches;
    if (!desktop) setArtifactContentId(null);
    window.setTimeout(focusComposer, desktop ? 0 : 80);
  }

  /**
   * 清单「在对话中发起发布确认」(C8):保存已由面板冲刷完成,
   * 这里把 publishTarget 随消息提交,服务端生成就绪卡。
   * <1180px 时 Artifact 全屏覆盖对话,先收起面板让用户看到就绪卡。
   */
  async function handlePublishPrepare(params: {
    contentId: string;
    title: string;
  }): Promise<boolean> {
    const text = `准备发布《${(params.title || "未命名内容").slice(0, 40)}》`;
    const sent = await submitText(text, {
      publishTarget: { contentId: params.contentId },
    });
    if (sent && !window.matchMedia("(min-width: 1180px)").matches) {
      setArtifactContentId(null);
    }
    return sent;
  }

  /** 就绪卡「打开检查清单」:打开对应作品的 Artifact 面板并展开清单。 */
  function handleOpenPublishChecklist(card: PublishReadinessCard) {
    setArtifactContentId(card.contentId);
    setOpenArtifacts((current) => current.some((item) => item.id === card.contentId)
      ? current
      : [...current, { id: card.contentId, title: card.title }]);
    setLastArtifactContentId(card.contentId);
    setChecklistRequest({ contentId: card.contentId, nonce: ++checklistNonceRef.current });
  }

  /** 就绪卡「复制待处理项」:把阻塞/提醒项转成修改指令预填输入框。 */
  function handleCopyMissingItems(card: PublishReadinessCard) {
    const prompt = missingItemsPrompt(card.items);
    setComposerValue(prompt || "请帮我检查这篇内容还有哪些发布前需要完善的地方:");
    const desktop = window.matchMedia("(min-width: 1180px)").matches;
    if (!desktop) setArtifactContentId(null);
    window.setTimeout(focusComposer, desktop ? 0 : 80);
  }

  /** 「打开发布中心」:应用内跳转 /publish,携带内容预选;不执行卡内任意地址。 */
  function handleOpenPublishWorkspace(contentId: string | null) {
    router.push(
      contentId
        ? `/publish?contentId=${encodeURIComponent(contentId)}&from=creator`
        : "/publish?from=creator",
    );
  }

  /** 「打开连接设置」:应用内跳转连接设置页。 */
  function handleOpenConnections() {
    router.push("/settings/connections");
  }

  const handleJobSettled = useCallback(() => {
    if (conversationId) void reloadMessages(conversationId, true);
  }, [conversationId, reloadMessages]);

  function handleStartNew() {
    setComposerValue("");
    setSelectedSkillIds([]);
    navigate(platform, { contentId });
  }

  const conversationTitle =
    conversations.find((conversation) => conversation.id === conversationId)?.title ?? null;

  const topbar = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="font-mono-metric hidden shrink-0 text-[9px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">
        WORKBENCH
      </span>
      <span aria-hidden="true" className="hidden h-4 border-l sm:block" />
      <h1 className="truncate text-sm font-semibold tracking-[-0.015em]">
        {threadState === "ready" && conversationTitle
          ? conversationTitle
          : global
            ? "多平台创作"
            : `${PLATFORM_LABEL[platform]}创作`}
      </h1>
      <span className="font-mono-metric shrink-0 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        {global ? "对话工作台" : PLATFORM_LABEL[platform]}
      </span>
      {busy ? (
        <span className="shrink-0 text-[11px] font-medium text-primary">生成中</span>
      ) : null}
      {lastArtifactContentId && !artifactContentId ? (
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-8 shrink-0 px-2 text-[11px]"
          onClick={() => setArtifactContentId(lastArtifactContentId)}
          data-testid="topbar-open-artifact"
        >
          <FileText data-icon="inline-start" /> 打开作品
        </Button>
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
          skills={skills}
          selectedSkillIds={selectedSkillIds}
          contextUsage={contextUsage}
          chips={
            patchTarget
              ? [...chips, { id: "patch-target", kind: "patch" as const, label: patchTarget.label }]
              : chips
          }
          onChange={setComposerValue}
          onSend={() => void handleSend()}
          onPickSkill={handlePickSkill}
          onToggleSkill={handleToggleSkill}
          onAddMention={(item) => setChips((current) =>
            current.some((chip) => chip.id === item.id && chip.kind === item.kind)
              ? current
              : [...current, item],
          )}
          onRemoveChip={(id) => {
            if (id === "patch-target") {
              setPatchTarget(null);
              return;
            }
            setChips((current) => current.filter((chip) => chip.id !== id));
            if (contentId === id) {
              navigate(platform, { conversationId });
            }
          }}
          onSwitchPlatform={(next) => navigate(next, { conversationId, contentId })}
          showPlatformSwitcher={!global}
        />
      }
      sidebarCollapsed={sidebarCollapsed}
      onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      drawerOpen={drawerOpen}
      onDrawerOpenChange={setDrawerOpen}
      artifact={
        artifactContentId ? (
          <div className="flex min-h-0 h-full flex-col bg-background">
            <div className="flex h-10 shrink-0 items-end gap-1 overflow-x-auto border-b px-2">
              {openArtifacts.map((artifact) => (
                <div key={artifact.id} className="flex max-w-48 items-center rounded-t-md border border-b-0 bg-card">
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate px-3 py-2 text-left text-xs"
                    aria-current={artifact.id === artifactContentId ? "page" : undefined}
                    onClick={() => setArtifactContentId(artifact.id)}
                  >
                    {artifact.title}
                  </button>
                  <button
                    type="button"
                    className="p-2 text-muted-foreground hover:text-foreground"
                    aria-label={`关闭 ${artifact.title}`}
                    onClick={() => {
                      const remaining = openArtifacts.filter((item) => item.id !== artifact.id);
                      setOpenArtifacts(remaining);
                      if (artifact.id === artifactContentId) {
                        setArtifactContentId(remaining.at(-1)?.id ?? null);
                      }
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              <ArtifactPanel
                contentId={artifactContentId}
                onClose={() => {
                  setArtifactContentId(null);
                  setChecklistRequest(null);
                }}
                onAskRefine={handleArtifactAskRefine}
                pendingInsert={pendingInsert}
                onPublishPrepare={handlePublishPrepare}
                openChecklistNonce={
                  checklistRequest && checklistRequest.contentId === artifactContentId
                    ? checklistRequest.nonce
                    : 0
                }
              />
            </div>
          </div>
        ) : undefined
      }
    >
      <ConversationThread
        messages={messages}
        state={threadState}
        errorMessage={threadError}
        busy={busy}
        processedKeys={processedKeys}
        activeRun={activeRun}
        runTraces={runTraces}
        checkpoints={checkpoints}
        quickEntries={quickEntriesFor(platform)}
        onQuickEntry={handleQuickEntry}
        onStartNew={handleStartNew}
        onInvokeAction={handleInvokeAction}
        onRetry={handleRetry}
        onCancelRun={(runId) => void handleCancelRun(runId)}
        onArtifactOpen={handleArtifactOpen}
        onArtifactRefine={handleArtifactRefine}
        onPatchCopyToEditor={handlePatchCopyToEditor}
        onPatchRefineAgain={handlePatchRefineAgain}
        onOpenPublishChecklist={handleOpenPublishChecklist}
        onCopyMissingItems={handleCopyMissingItems}
        onOpenPublishWorkspace={handleOpenPublishWorkspace}
        onOpenConnections={handleOpenConnections}
        onJobSettled={handleJobSettled}
      />
    </CreatorShell>
  );
}
