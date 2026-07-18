"use client";

/**
 * Artifact 面板数据与草稿状态。
 *
 * 版本正确性规则(C5):
 * - 查看/切换版本不置 dirty,不触发自动保存(修复旧工作台切换即保存的缺陷)。
 * - 恢复版本只提交 fromRevisionId,payload 由服务端从被选中版本读取(修复旧闭包草稿覆盖)。
 * - 面板打开期间轮询;发现外来新版本(如生成完成)时:
 *   有未保存人工修改 → 进入冲突状态,由用户显式选择,绝不静默覆盖;
 *   无修改且正在看最新版 → 跟随到新版本并提示。
 * - 切换/恢复/导出/评分前先冲刷未保存草稿,任何路径都不丢人工修改。
 *
 * C6 增量:
 * - 草稿扩展为 { title, body, structured }:分页/分镜/标签等结构字段
 *   与标题正文共用同一套编辑历史、自动保存与冲突机制;
 *   结构编辑必须以 immutable 方式产生新对象。
 * - 查看非最新版本 = 只读预览(previewing):不允许编辑,
 *   恢复或回到最新版后才能继续修改;预览期间外部新版本只提示,不弹冲突。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readApiJson } from "@/lib/api-client";
import { buildManualRevisionPayload } from "@/lib/content/markdown";
import type { ContentKindId, PlatformId } from "@/lib/platforms/registry";

export type ArtifactRevision = {
  id: string;
  revisionNumber: number;
  source: "generated" | "manual" | "restored";
  title: string | null;
  bodyText: string | null;
  structuredContent: unknown;
  fullMarkdown: string | null;
  checksum: string;
  provenance: unknown;
  createdAt: string;
};

export type ArtifactReference = {
  id: string;
  role: string;
  sourceUrl: string | null;
  snapshot: unknown;
  createdAt: string;
};

export type ArtifactScoreDimension = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  reasons: string[];
};

export type ArtifactScore = {
  total: number;
  maxScore: number;
  dimensions: ArtifactScoreDimension[];
  warnings: string[];
};

export type ArtifactDirectionReview = {
  id: string;
  revisionId: string;
  stage: "generation" | "publish";
  status: "passed" | "needs_attention" | "unavailable";
  primaryLabel: string;
  secondaryLabel?: string;
  score?: number;
  summary: string;
  criteria: Array<{
    key: string;
    label: string;
    score: number;
    maxScore: number;
    passed: boolean;
    reason: string;
  }>;
  suggestions: string[];
};

export type ArtifactContentData = {
  id: string;
  platform: PlatformId;
  contentKind: ContentKindId;
  title: string | null;
  tags: string[];
  interactionEnding: string | null;
  riskNotes: string | null;
  status: string;
  updatedAt: string;
  score: ArtifactScore | null;
  directionReview: ArtifactDirectionReview | null;
  revisions: ArtifactRevision[];
  references: ArtifactReference[];
};

export type ArtifactDraft = {
  title: string;
  body: string;
  /** 当前草稿的结构化内容(分页/分镜/标签等);无结构化数据的旧版本为 null */
  structured: Record<string, unknown> | null;
};

export type ArtifactConflict = { incoming: ArtifactRevision };

type SaveState = "idle" | "saving" | "saved" | "error";

const POLL_INTERVAL_MS = 5000;
const AUTOSAVE_DELAY_MS = 2500;
const HISTORY_GROUP_MS = 800;
const HISTORY_LIMIT = 50;

const EMPTY_DRAFT: ArtifactDraft = { title: "", body: "", structured: null };

function structuredOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseScore(value: unknown): ArtifactScore | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.total !== "number" || !Array.isArray(record.dimensions)) return null;
  return {
    total: record.total,
    maxScore: typeof record.maxScore === "number" ? record.maxScore : 100,
    dimensions: record.dimensions
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        key: typeof item.key === "string" ? item.key : "",
        label: typeof item.label === "string" ? item.label : "",
        score: typeof item.score === "number" ? item.score : 0,
        maxScore: typeof item.maxScore === "number" ? item.maxScore : 0,
        reasons: Array.isArray(item.reasons)
          ? item.reasons.filter((reason): reason is string => typeof reason === "string")
          : [],
      })),
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
  };
}

type RawContent = {
  id: string;
  platform: PlatformId;
  contentKind: ContentKindId;
  title: string | null;
  tags: string[];
  interactionEnding: string | null;
  riskNotes: string | null;
  status: string;
  updatedAt: string;
  scoreSnapshot: unknown;
  directionReviews?: Array<{
    id: string;
    revisionId: string;
    stage: "generation" | "publish";
    status: "passed" | "needs_attention" | "unavailable";
    result: unknown;
  }>;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    source: "generated" | "manual" | "restored";
    title: string | null;
    bodyText: string | null;
    structuredContent: unknown;
    fullMarkdown: string | null;
    checksum: string;
    provenance: unknown;
    createdAt: string;
  }>;
  contentReferences: Array<{
    id: string;
    role: string;
    sourceUrl: string | null;
    snapshot: unknown;
    createdAt: string;
  }>;
};

function toContentData(raw: RawContent): ArtifactContentData {
  const latestRevisionId = raw.revisions?.[0]?.id;
  const latestDirectionReview = raw.directionReviews?.find((review) => review.revisionId === latestRevisionId);
  return {
    id: raw.id,
    platform: raw.platform,
    contentKind: raw.contentKind,
    title: raw.title,
    tags: raw.tags ?? [],
    interactionEnding: raw.interactionEnding,
    riskNotes: raw.riskNotes,
    status: raw.status,
    updatedAt: raw.updatedAt,
    score: parseScore(raw.scoreSnapshot),
    directionReview: parseDirectionReview(latestDirectionReview),
    revisions: raw.revisions ?? [],
    references: raw.contentReferences ?? [],
  };
}

function parseDirectionReview(
  row: RawContent["directionReviews"] extends Array<infer T> | undefined ? T | undefined : never,
): ArtifactDirectionReview | null {
  if (!row || !row.result || typeof row.result !== "object" || Array.isArray(row.result)) return null;
  const result = row.result as Record<string, unknown>;
  const criteria = Array.isArray(result.criteria)
    ? result.criteria.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const item = value as Record<string, unknown>;
        if (typeof item.key !== "string" || typeof item.label !== "string") return [];
        return [{
          key: item.key,
          label: item.label,
          score: typeof item.score === "number" ? item.score : 0,
          maxScore: typeof item.maxScore === "number" ? item.maxScore : 0,
          passed: item.passed === true,
          reason: typeof item.reason === "string" ? item.reason : "",
        }];
      })
    : [];
  return {
    id: row.id,
    revisionId: row.revisionId,
    stage: row.stage,
    status: row.status,
    primaryLabel: typeof result.primaryLabel === "string" ? result.primaryLabel : "表达方向",
    ...(typeof result.secondaryLabel === "string" ? { secondaryLabel: result.secondaryLabel } : {}),
    ...(typeof result.score === "number" ? { score: result.score } : {}),
    summary: typeof result.summary === "string" ? result.summary : "",
    criteria,
    suggestions: Array.isArray(result.suggestions)
      ? result.suggestions.filter((value): value is string => typeof value === "string")
      : [],
  };
}

async function fetchContent(contentId: string): Promise<ArtifactContentData> {
  const data = await readApiJson<{ content: RawContent }>(
    await fetch(`/api/content/${contentId}`, { cache: "no-store" }),
  );
  return toContentData(data.content);
}

export function useArtifact(contentId: string) {
  const [content, setContent] = useState<ArtifactContentData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);

  const [viewRevisionId, setViewRevisionId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ArtifactDraft>(EMPTY_DRAFT);
  const [dirty, setDirty] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ArtifactConflict | null>(null);
  const [updateNotice, setUpdateNotice] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [busyAction, setBusyAction] = useState<"restore" | "score" | "export" | null>(null);

  const contentRef = useRef<ArtifactContentData | null>(null);
  const draftRef = useRef(draft);
  const dirtyRef = useRef(dirty);
  const previewingRef = useRef(previewing);
  const conflictRef = useRef(conflict);
  const viewRevisionIdRef = useRef<string | null>(null);
  const knownLatestIdRef = useRef<string | null>(null);
  const ownRevisionIdsRef = useRef<Set<string>>(new Set());
  const savePromiseRef = useRef<Promise<ArtifactRevision | null> | null>(null);
  const historyRef = useRef<{ stack: ArtifactDraft[]; index: number; lastPushAt: number }>({
    stack: [EMPTY_DRAFT],
    index: 0,
    lastPushAt: 0,
  });

  draftRef.current = draft;
  dirtyRef.current = dirty;
  previewingRef.current = previewing;
  conflictRef.current = conflict;
  contentRef.current = content;
  viewRevisionIdRef.current = viewRevisionId;

  const seedDraft = useCallback((revision: ArtifactRevision | null) => {
    const next: ArtifactDraft = revision
      ? {
          title: revision.title ?? "",
          body: revision.bodyText ?? "",
          structured: structuredOf(revision.structuredContent),
        }
      : EMPTY_DRAFT;
    setDraft(next);
    setDirty(false);
    setPreviewing(false);
    setViewRevisionId(revision?.id ?? null);
    historyRef.current = { stack: [next], index: 0, lastPushAt: 0 };
    setHistoryVersion((version) => version + 1);
  }, []);

  const applyContent = useCallback((data: ArtifactContentData) => {
    setContent(data);
    knownLatestIdRef.current = data.revisions[0]?.id ?? null;
  }, []);

  // 初始加载:默认查看最新版本
  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");
    setConflict(null);
    setUpdateNotice(null);
    ownRevisionIdsRef.current = new Set();
    fetchContent(contentId)
      .then((data) => {
        if (cancelled) return;
        applyContent(data);
        seedDraft(data.revisions[0] ?? null);
        setLoadState("ready");
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadState("error");
        setLoadError(error instanceof Error ? error.message : "内容加载失败。");
      });
    return () => {
      cancelled = true;
    };
  }, [contentId, applyContent, seedDraft]);

  // 面板打开期间轮询:接收生成完成等外部新版本,驱动冲突/跟随逻辑
  useEffect(() => {
    if (loadState !== "ready") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void (async () => {
        try {
          const previousLatestId = knownLatestIdRef.current;
          const data = await fetchContent(contentId);
          // 丢弃迟到的旧快照:保存请求先落库时,先发出的轮询可能带回更旧的版本列表
          const localMax = contentRef.current?.revisions[0]?.revisionNumber ?? 0;
          const remoteMax = data.revisions[0]?.revisionNumber ?? 0;
          if (remoteMax < localMax) return;
          const nextLatest = data.revisions[0] ?? null;
          applyContent(data);
          if (
            nextLatest &&
            previousLatestId &&
            nextLatest.id !== previousLatestId &&
            !ownRevisionIdsRef.current.has(nextLatest.id)
          ) {
            const viewingId = viewRevisionIdRef.current;
            const viewingPreviousLatest = viewingId === previousLatestId;
            const viewingSource = data.revisions.find(
              (revision) => revision.id === viewingId,
            )?.source;
            if (
              dirtyRef.current ||
              (viewingPreviousLatest &&
                viewingSource !== "generated" &&
                !previewingRef.current)
            ) {
              // 有未保存修改,或正在编辑自己的 manual/restored 版本:
              // 进入冲突,由用户显式选择,绝不静默覆盖/切换。
              // 只读预览中没有可丢失的编辑,不弹冲突,走下方提示分支。
              setConflict({ incoming: nextLatest });
            } else if (viewingPreviousLatest && !previewingRef.current) {
              seedDraft(nextLatest);
              setUpdateNotice(
                `内容已更新到 v${nextLatest.revisionNumber}(${sourceLabel(nextLatest.source)})。`,
              );
            } else {
              setUpdateNotice(
                `已生成新版本 v${nextLatest.revisionNumber},可在版本菜单中查看。`,
              );
            }
          }
        } catch {
          // 轮询失败不打断编辑;下一轮继续
        }
      })();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [contentId, loadState, applyContent, seedDraft]);

  const viewRevision = useMemo(
    () => content?.revisions.find((revision) => revision.id === viewRevisionId) ?? null,
    [content, viewRevisionId],
  );
  const latestRevision = content?.revisions[0] ?? null;

  /** 保存当前草稿为 manual 版本;供自动保存与冲刷共用。 */
  const performSave = useCallback(async (): Promise<ArtifactRevision | null> => {
    const contentData = contentRef.current;
    if (!contentData || !dirtyRef.current) return null;
    if (savePromiseRef.current) return savePromiseRef.current;

    const snapshot = { ...draftRef.current };
    setSaveState("saving");

    const promise = (async () => {
      try {
        // 草稿的 structured 就是编辑后的结构化内容;
        // 标题/正文由 payload 构建器合并进去并重建 fullMarkdown
        const payload = buildManualRevisionPayload({
          contentKind: contentData.contentKind,
          baseStructuredContent: snapshot.structured,
          title: snapshot.title,
          bodyText: snapshot.body,
        });
        const data = await readApiJson<{ revision: ArtifactRevision }>(
          await fetch(`/api/content/${contentData.id}/revisions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: "manual",
              ...payload,
              expectedRevisionId: knownLatestIdRef.current,
              expectedChecksum: contentRef.current?.revisions.find(
                (revision) => revision.id === knownLatestIdRef.current,
              )?.checksum,
            }),
          }),
        );
        const revision = data.revision;
        ownRevisionIdsRef.current.add(revision.id);
        knownLatestIdRef.current = revision.id;
        setContent((previous) =>
          previous ? { ...previous, revisions: [revision, ...previous.revisions] } : previous,
        );
        setViewRevisionId(revision.id);
        // 保存期间若又有输入,保持 dirty 让自动保存继续
        const unchanged =
          draftRef.current.title === snapshot.title &&
          draftRef.current.body === snapshot.body &&
          draftRef.current.structured === snapshot.structured;
        if (unchanged) setDirty(false);
        setSaveState("saved");
        setSaveError(null);
        return revision;
      } catch (error) {
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "保存失败,请重试。");
        return null;
      } finally {
        savePromiseRef.current = null;
      }
    })();
    savePromiseRef.current = promise;
    return promise;
  }, []);

  /** 冲刷:等待在途保存,再把仍未保存的草稿落库。失败返回 false。 */
  const flushDraft = useCallback(async (): Promise<boolean> => {
    if (savePromiseRef.current) await savePromiseRef.current;
    if (!dirtyRef.current) return true;
    const revision = await performSave();
    return revision !== null;
  }, [performSave]);

  // 自动保存:仅在用户实际编辑(dirty)且无冲突时;查看/切换版本不会触发
  useEffect(() => {
    if (!dirty || conflict || loadState !== "ready") return;
    const timer = window.setTimeout(() => void performSave(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, conflict, loadState, saveState, performSave]);

  const editDraft = useCallback((patch: Partial<ArtifactDraft>) => {
    // 只读预览中不接受编辑;恢复或回到最新版后才能修改
    if (previewingRef.current) return;
    setUpdateNotice(null);
    setDraft((previous) => {
      const next = { ...previous, ...patch };
      const history = historyRef.current;
      const now = Date.now();
      if (now - history.lastPushAt > HISTORY_GROUP_MS) {
        history.stack = [...history.stack.slice(0, history.index + 1), next].slice(
          -HISTORY_LIMIT,
        );
        history.index = history.stack.length - 1;
      } else {
        history.stack[history.index] = next;
      }
      history.lastPushAt = now;
      return next;
    });
    setDirty(true);
    setHistoryVersion((version) => version + 1);
  }, []);

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (history.index <= 0) return;
    history.index -= 1;
    history.lastPushAt = 0;
    setDraft(history.stack[history.index]);
    setDirty(true);
    setHistoryVersion((version) => version + 1);
  }, []);

  const redo = useCallback(() => {
    const history = historyRef.current;
    if (history.index >= history.stack.length - 1) return;
    history.index += 1;
    history.lastPushAt = 0;
    setDraft(history.stack[history.index]);
    setDirty(true);
    setHistoryVersion((version) => version + 1);
  }, []);

  /**
   * 查看某个版本:先冲刷未保存修改,再载入目标版本;不置 dirty。
   * 非最新版本进入只读预览,编辑须恢复该版本或回到最新版。
   */
  const viewRevisionById = useCallback(
    async (revisionId: string): Promise<boolean> => {
      if (revisionId === viewRevisionIdRef.current) return true;
      if (!(await flushDraft())) return false;
      const target = contentRef.current?.revisions.find(
        (revision) => revision.id === revisionId,
      );
      if (!target) return false;
      seedDraft(target);
      setPreviewing(target.id !== contentRef.current?.revisions[0]?.id);
      setUpdateNotice(null);
      return true;
    },
    [flushDraft, seedDraft],
  );

  /** 从只读预览回到最新版本继续编辑。 */
  const viewLatest = useCallback(async (): Promise<boolean> => {
    const latest = contentRef.current?.revisions[0];
    if (!latest) return false;
    return viewRevisionById(latest.id);
  }, [viewRevisionById]);

  /** 恢复版本:服务端按被选中版本 payload 创建新版本;客户端不上传正文。 */
  const restoreRevision = useCallback(
    async (revisionId: string): Promise<ArtifactRevision | null> => {
      const contentData = contentRef.current;
      if (!contentData || busyAction) return null;
      setBusyAction("restore");
      try {
        if (!(await flushDraft())) return null;
        const data = await readApiJson<{ revision: ArtifactRevision }>(
          await fetch(`/api/content/${contentData.id}/revisions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ source: "restored", fromRevisionId: revisionId }),
          }),
        );
        const revision = data.revision;
        ownRevisionIdsRef.current.add(revision.id);
        knownLatestIdRef.current = revision.id;
        setContent((previous) =>
          previous ? { ...previous, revisions: [revision, ...previous.revisions] } : previous,
        );
        seedDraft(revision);
        const from = contentData.revisions.find((item) => item.id === revisionId);
        setUpdateNotice(
          from
            ? `已把 v${from.revisionNumber} 恢复为新版本 v${revision.revisionNumber}。`
            : `已恢复为新版本 v${revision.revisionNumber}。`,
        );
        setSaveError(null);
        return revision;
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "恢复失败,请重试。");
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction, flushDraft, seedDraft],
  );

  /** 重新评分:先冲刷草稿,评分基于最新已保存版本。 */
  const rescore = useCallback(async (): Promise<ArtifactScore | null> => {
    const contentData = contentRef.current;
    if (!contentData || busyAction) return null;
    setBusyAction("score");
    try {
      if (!(await flushDraft())) return null;
      const data = await readApiJson<{ score: ArtifactScore; directionReview?: ArtifactDirectionReview | null }>(
        await fetch(`/api/content/${contentData.id}/score`, { method: "POST" }),
      );
      const score = parseScore(data.score);
      setContent((previous) => (previous ? {
        ...previous,
        score,
        directionReview: data.directionReview ?? previous.directionReview,
      } : previous));
      return score;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "评分失败,请重试。");
      return null;
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, flushDraft]);

  /** 导出:先冲刷草稿,导出当前查看版本的 Markdown。 */
  const exportMarkdown = useCallback(async (): Promise<{
    filename: string;
    markdown: string;
  } | null> => {
    const contentData = contentRef.current;
    if (!contentData || busyAction) return null;
    setBusyAction("export");
    try {
      if (!(await flushDraft())) return null;
      const revision = contentRef.current?.revisions.find(
        (item) => item.id === viewRevisionIdRef.current,
      );
      if (!revision) return null;
      const markdown =
        revision.fullMarkdown ??
        [`# ${revision.title ?? "未命名"}`, revision.bodyText ?? ""].join("\n\n");
      const safeTitle = (revision.title ?? contentData.title ?? "内容")
        .replace(/[\\/:*?"<>|\s]+/g, "-")
        .slice(0, 40);
      return { filename: `${safeTitle}-v${revision.revisionNumber}.md`, markdown };
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, flushDraft]);

  /** 冲突:保留我的版本 → 未保存草稿另存为新 manual 版本;已保存则原地保留(生成版本仍在历史中)。 */
  const resolveConflictKeepMine = useCallback(async () => {
    if (dirtyRef.current) {
      const revision = await performSave();
      if (!revision) return false;
    }
    setConflict(null);
    return true;
  }, [performSave]);

  /** 冲突:采用新版本 → 放弃当前草稿,载入外来版本。 */
  const resolveConflictUseIncoming = useCallback(() => {
    const incoming = conflictRef.current?.incoming;
    if (!incoming) return;
    const fresh =
      contentRef.current?.revisions.find((revision) => revision.id === incoming.id) ?? incoming;
    seedDraft(fresh);
    setConflict(null);
    setUpdateNotice(`已切换到 v${fresh.revisionNumber}(${sourceLabel(fresh.source)})。`);
  }, [seedDraft]);

  /** 手动合并:保留当前草稿，关闭阻断提示；后续保存会基于已知最新修订创建新版本。 */
  const resolveConflictManualMerge = useCallback(() => {
    if (!conflictRef.current) return;
    setConflict(null);
    setUpdateNotice("已进入手动合并。当前草稿保持不变，保存时会创建新的人工修订。");
  }, []);

  const history = historyRef.current;
  void historyVersion;

  return {
    content,
    loadState,
    loadError,
    draft,
    dirty,
    previewing,
    saveState,
    saveError,
    conflict,
    updateNotice,
    busyAction,
    viewRevision,
    latestRevision,
    canUndo: history.index > 0,
    canRedo: history.index < history.stack.length - 1,
    editDraft,
    undo,
    redo,
    saveNow: performSave,
    flushDraft,
    viewRevisionById,
    viewLatest,
    restoreRevision,
    rescore,
    exportMarkdown,
    resolveConflictKeepMine,
    resolveConflictUseIncoming,
    resolveConflictManualMerge,
    dismissNotice: () => setUpdateNotice(null),
  };
}

export function sourceLabel(source: ArtifactRevision["source"]): string {
  if (source === "generated") return "AI 生成";
  if (source === "restored") return "恢复";
  return "手动保存";
}
