import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import type {
  XhsDataAdapter,
  XhsFetchInput,
  XhsFetchResult,
  XhsFetchStatus,
} from "@/lib/xhs/types";
import { resolveXhsInput } from "@/lib/xhs/resolver";
import { normalizeAccount, normalizeNote } from "@/lib/xhs/normalizer";
import {
  createManualRequiredResult,
  MANUAL_REQUIRED_FIELDS,
} from "@/lib/xhs/adapters/base";
import { mockAdapter } from "@/lib/xhs/adapters/mock-adapter";
import { thirdPartyAdapter } from "@/lib/xhs/adapters/third-party-adapter";
import { publicPageAdapter } from "@/lib/xhs/adapters/public-page-adapter";
import { manualFallbackAdapter } from "@/lib/xhs/adapters/manual-fallback-adapter";
import type { InputType, Prisma } from "@prisma/client";

export type ManualTemplate = {
  profileDescription: string;
  recentNoteTitles: string[];
  sampleNotes: string[];
  learningReason: string;
  requiredFields: string[];
};

export type SavedAccountSummary = {
  id: string;
  xhsId: string | null;
  nickname: string | null;
  description: string | null;
  profileUrl: string | null;
  category: string | null;
  followerCount: number | null;
  fetchStatus: string;
  lastFetchedAt: Date | null;
};

export type XhsFetchServiceResult = {
  status: XhsFetchStatus;
  accountId?: string;
  account?: SavedAccountSummary;
  noteId?: string;
  note?: { id: string; title: string | null; content: string | null };
  manualTemplate?: ManualTemplate;
  errorMessage?: string;
  sourceType: string;
  dataConfidence: number;
  cached?: boolean;
};

function getAdapterChain(): XhsDataAdapter[] {
  switch (env.XHS_FETCH_PROVIDER) {
    case "mock":
      return [mockAdapter, manualFallbackAdapter];
    case "third_party":
      return [thirdPartyAdapter, publicPageAdapter, manualFallbackAdapter];
    case "public_page":
      return [publicPageAdapter, manualFallbackAdapter];
  }
}

function inputTypeToDbEnum(type: XhsFetchInput["type"]): InputType {
  if (type === "xhs_id") return "xhs_id";
  if (type === "profile_url") return "xhs_profile_url";
  return "xhs_note_url";
}

async function runAdapters(
  chain: XhsDataAdapter[],
  input: XhsFetchInput
): Promise<XhsFetchResult> {
  let last: XhsFetchResult | null = null;
  for (const adapter of chain) {
    const method =
      input.type === "xhs_id"
        ? adapter.fetchAccountById
        : input.type === "profile_url"
          ? adapter.fetchAccountByProfileUrl
          : adapter.fetchNoteByUrl;
    if (!method) continue;
    try {
      const result = await method.call(adapter, input.value);
      last = result;
      if (result.status === "success" || result.status === "partial") {
        return result;
      }
    } catch (error) {
      last = {
        status: "failed",
        sourceType: adapter.name,
        dataConfidence: 0,
        errorMessage: error instanceof Error ? error.message : "Adapter failed",
      };
    }
  }
  return last ?? createManualRequiredResult(input.value);
}

function toManualTemplate(): ManualTemplate {
  return {
    profileDescription: "",
    recentNoteTitles: [],
    sampleNotes: [],
    learningReason: "",
    requiredFields: MANUAL_REQUIRED_FIELDS,
  };
}

export async function fetchAndSaveXhs(params: {
  userId: string;
  input: string;
}): Promise<XhsFetchServiceResult> {
  const resolved = resolveXhsInput(params.input);

  if (!resolved) {
    await safeCreateFetchLog({
      userId: params.userId,
      input: params.input,
      inputType: "unknown",
      status: "manual_required",
      errorMessage: "Could not recognize the input as an XHS id or URL.",
    });
    return {
      status: "manual_required",
      sourceType: "resolver",
      dataConfidence: 0,
      errorMessage: "Paste an XHS id, profile URL, note URL, or enter details manually.",
      manualTemplate: toManualTemplate(),
    };
  }

  const dbInputType = inputTypeToDbEnum(resolved.type);
  if (resolved.type === "xhs_id" || resolved.type === "profile_url") {
    const cached = await findFreshCachedAccount(params.userId, resolved);
    if (cached) {
      return {
        status: "success",
        accountId: cached.id,
        account: toSummary(cached),
        sourceType: cached.sourceType ?? "cache",
        dataConfidence: cached.dataConfidence ?? 0.5,
        cached: true,
      };
    }
  }

  const result = await runAdapters(getAdapterChain(), resolved);
  await safeCreateFetchLog({
    userId: params.userId,
    input: params.input,
    inputType: dbInputType,
    status: result.status,
    resultType: result.account ? "account" : result.note ? "note" : null,
    errorMessage: result.errorMessage ?? null,
    rawResponse: (result.rawData as Prisma.InputJsonValue) ?? undefined,
  });

  if (result.status === "manual_required" || result.status === "failed") {
    return {
      status: result.status,
      sourceType: result.sourceType,
      dataConfidence: result.dataConfidence,
      errorMessage: result.errorMessage,
      manualTemplate: toManualTemplate(),
    };
  }

  let accountId: string | undefined;
  let account: SavedAccountSummary | undefined;
  if (result.account) {
    const saved = await upsertAccount(params.userId, result, resolved);
    accountId = saved.id;
    account = toSummary(saved);
    if (result.account.recentNotes?.length) {
      await saveNotes(saved.id, result);
    }
  }

  let noteId: string | undefined;
  let note: { id: string; title: string | null; content: string | null } | undefined;
  if (result.note) {
    const savedNote = await saveSingleNote(accountId ?? null, result);
    noteId = savedNote.id;
    note = { id: savedNote.id, title: savedNote.title, content: savedNote.content };
  }

  return {
    status: result.status,
    accountId,
    account,
    noteId,
    note,
    sourceType: result.sourceType,
    dataConfidence: result.dataConfidence,
  };
}

async function findFreshCachedAccount(userId: string, input: XhsFetchInput) {
  const cacheMs = env.XHS_FETCH_CACHE_HOURS * 3600 * 1000;
  if (cacheMs <= 0) return null;
  const since = new Date(Date.now() - cacheMs);
  return prisma.benchmarkAccount.findFirst({
    where: {
      userId,
      isArchived: false,
      fetchStatus: "success",
      lastFetchedAt: { gte: since },
      ...(input.type === "xhs_id"
        ? { xhsId: input.value }
        : { profileUrl: input.value }),
    },
    orderBy: { lastFetchedAt: "desc" },
  });
}

async function upsertAccount(
  userId: string,
  result: XhsFetchResult,
  input: XhsFetchInput
) {
  const acc = normalizeAccount(result.account!);
  const existing = await prisma.benchmarkAccount.findFirst({
    where: {
      userId,
      OR: [
        acc.xhsId ? { xhsId: acc.xhsId } : undefined,
        acc.profileUrl ? { profileUrl: acc.profileUrl } : undefined,
      ].filter(Boolean) as Prisma.BenchmarkAccountWhereInput[],
    },
  });

  const data = {
    ...acc,
    rawData: (result.rawData as Prisma.InputJsonValue) ?? undefined,
    sourceType: result.sourceType,
    sourceUrl: input.type !== "xhs_id" ? input.value : acc.profileUrl,
    dataConfidence: result.dataConfidence,
    lastFetchedAt: new Date(),
    fetchStatus: "success" as const,
    isArchived: false,
  };

  if (existing) {
    return prisma.benchmarkAccount.update({ where: { id: existing.id }, data });
  }
  return prisma.benchmarkAccount.create({ data: { userId, ...data } });
}

async function saveNotes(accountId: string, result: XhsFetchResult) {
  const notes = result.account?.recentNotes ?? [];
  for (const raw of notes) {
    const note = normalizeNote(raw);
    const existing = note.noteId
      ? await prisma.benchmarkNote.findFirst({ where: { accountId, noteId: note.noteId } })
      : null;
    const data = {
      ...note,
      sourceType: result.sourceType,
      dataConfidence: result.dataConfidence,
      rawData: raw as Prisma.InputJsonValue,
    };
    if (existing) {
      await prisma.benchmarkNote.update({ where: { id: existing.id }, data });
    } else {
      await prisma.benchmarkNote.create({ data: { accountId, ...data } });
    }
  }
}

async function saveSingleNote(accountId: string | null, result: XhsFetchResult) {
  const note = normalizeNote(result.note!);
  const existing = note.noteUrl
    ? await prisma.benchmarkNote.findFirst({ where: { noteUrl: note.noteUrl } })
    : null;
  const data = {
    ...note,
    accountId,
    sourceType: result.sourceType,
    dataConfidence: result.dataConfidence,
    rawData: result.note as Prisma.InputJsonValue,
  };
  if (existing) {
    return prisma.benchmarkNote.update({ where: { id: existing.id }, data });
  }
  return prisma.benchmarkNote.create({ data });
}

function toSummary(account: {
  id: string;
  xhsId: string | null;
  nickname: string | null;
  description: string | null;
  profileUrl: string | null;
  category: string | null;
  followerCount: number | null;
  fetchStatus: string;
  lastFetchedAt: Date | null;
}): SavedAccountSummary {
  return {
    id: account.id,
    xhsId: account.xhsId,
    nickname: account.nickname,
    description: account.description,
    profileUrl: account.profileUrl,
    category: account.category,
    followerCount: account.followerCount,
    fetchStatus: account.fetchStatus,
    lastFetchedAt: account.lastFetchedAt,
  };
}

async function safeCreateFetchLog(data: {
  userId?: string;
  input: string;
  inputType: InputType;
  status: XhsFetchStatus;
  resultType?: string | null;
  errorMessage?: string | null;
  rawResponse?: Prisma.InputJsonValue;
}) {
  try {
    await prisma.fetchLog.create({
      data: {
        userId: data.userId,
        input: data.input.slice(0, 1000),
        inputType: data.inputType,
        status: data.status,
        resultType: data.resultType ?? undefined,
        errorMessage: data.errorMessage ?? undefined,
        rawResponse: data.rawResponse,
      },
    });
  } catch {
    // Fetch logging is non-critical.
  }
}
