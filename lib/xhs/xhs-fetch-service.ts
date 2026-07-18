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
import type { BenchmarkAccount, InputType, Prisma } from "@prisma/client";

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

type AccountIdentity = {
  xhsIds: string[];
  profileUrls: string[];
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

function normalizeXhsId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function canonicalizeProfileUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/+$/, "");
  } catch {
    const fallback = trimmed.replace(/[?#].*$/, "").replace(/\/+$/, "");
    return fallback || null;
  }
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(Boolean) as string[]));
}

function buildAccountIdentity(
  account: ReturnType<typeof normalizeAccount>,
  input?: XhsFetchInput
): AccountIdentity {
  return {
    xhsIds: uniqueValues([
      normalizeXhsId(account.xhsId),
      input?.type === "xhs_id" ? normalizeXhsId(input.value) : null,
    ]),
    profileUrls: uniqueValues([
      canonicalizeProfileUrl(account.profileUrl),
      input?.type === "profile_url" ? canonicalizeProfileUrl(input.value) : null,
    ]),
  };
}

function hasAccountIdentity(identity: AccountIdentity): boolean {
  return Boolean(identity.xhsIds.length || identity.profileUrls.length);
}

function accountMatchesIdentity(account: BenchmarkAccount, identity: AccountIdentity): boolean {
  const accountXhsId = normalizeXhsId(account.xhsId);
  const accountProfileUrl = canonicalizeProfileUrl(account.profileUrl);
  return Boolean(
    (accountXhsId && identity.xhsIds.includes(accountXhsId)) ||
      (accountProfileUrl && identity.profileUrls.includes(accountProfileUrl))
  );
}

async function findAccountsByIdentity(userId: string, identity: AccountIdentity) {
  if (!hasAccountIdentity(identity)) return [];

  const accounts = await prisma.benchmarkAccount.findMany({
    where: {
      userId,
      OR: [{ xhsId: { not: null } }, { profileUrl: { not: null } }],
    },
    orderBy: { updatedAt: "desc" },
  });
  return accounts.filter((account) => accountMatchesIdentity(account, identity));
}

function pickSurvivor(accounts: BenchmarkAccount[]) {
  return [...accounts].sort((a, b) => {
    if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0];
}

function firstExistingText(values: Array<string | null | undefined>) {
  return values.find((value) => value?.trim()) ?? null;
}

function mergeFetchedAccountData(params: {
  existing?: BenchmarkAccount;
  duplicates?: BenchmarkAccount[];
  account: ReturnType<typeof normalizeAccount>;
  result: XhsFetchResult;
  input: XhsFetchInput;
}) {
  const { existing, duplicates = [], account, result, input } = params;
  const profileUrl = canonicalizeProfileUrl(account.profileUrl);
  const sourceUrl =
    input.type !== "xhs_id" ? canonicalizeProfileUrl(input.value) : profileUrl;

  const data = {
    xhsId: normalizeXhsId(account.xhsId) ?? existing?.xhsId ?? null,
    nickname: account.nickname ?? existing?.nickname ?? null,
    avatarUrl: account.avatarUrl ?? existing?.avatarUrl ?? null,
    profileUrl: profileUrl ?? existing?.profileUrl ?? null,
    description: account.description ?? existing?.description ?? null,
    category: account.category ?? existing?.category ?? null,
    followerCount: account.followerCount ?? existing?.followerCount ?? null,
    followingCount: account.followingCount ?? existing?.followingCount ?? null,
    likedCount: account.likedCount ?? existing?.likedCount ?? null,
    noteCount: account.noteCount ?? existing?.noteCount ?? null,
    sourceType: result.sourceType,
    sourceUrl: sourceUrl ?? existing?.sourceUrl ?? null,
    dataConfidence: result.dataConfidence,
    lastFetchedAt: new Date(),
    fetchStatus: "success" as const,
    isArchived: false,
    isFavorite: existing?.isFavorite || duplicates.some((duplicate) => duplicate.isFavorite),
    userRemark:
      existing?.userRemark ?? firstExistingText(duplicates.map((duplicate) => duplicate.userRemark)),
    groupName:
      existing?.groupName ?? firstExistingText(duplicates.map((duplicate) => duplicate.groupName)),
  };

  return result.rawData === undefined
    ? data
    : { ...data, rawData: result.rawData as Prisma.InputJsonValue };
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
  const identity = buildAccountIdentity(
    {
      xhsId: input.type === "xhs_id" ? input.value : null,
      profileUrl: input.type === "profile_url" ? input.value : null,
      nickname: null,
      avatarUrl: null,
      description: null,
      category: null,
      followerCount: null,
      followingCount: null,
      likedCount: null,
      noteCount: null,
    },
    input
  );
  const matches = await findAccountsByIdentity(userId, identity);
  return (
    matches
      .filter(
        (account) =>
          !account.isArchived &&
          account.fetchStatus === "success" &&
          account.lastFetchedAt &&
          account.lastFetchedAt >= since
      )
      .sort(
        (a, b) =>
          (b.lastFetchedAt?.getTime() ?? 0) - (a.lastFetchedAt?.getTime() ?? 0)
      )[0] ?? null
  );
}

async function upsertAccount(
  userId: string,
  result: XhsFetchResult,
  input: XhsFetchInput
) {
  const acc = normalizeAccount(result.account!);
  const identity = buildAccountIdentity(acc, input);
  const matches = await findAccountsByIdentity(userId, identity);

  if (matches.length) {
    const survivor = pickSurvivor(matches);
    const duplicates = matches.filter((account) => account.id !== survivor.id);
    const data = mergeFetchedAccountData({
      existing: survivor,
      duplicates,
      account: acc,
      result,
      input,
    });

    return prisma.$transaction(async (tx) => {
      await mergeDuplicateAccountNotes(tx, survivor.id, duplicates);
      if (duplicates.length) {
        await tx.benchmarkAccount.updateMany({
          where: { id: { in: duplicates.map((account) => account.id) } },
          data: { isArchived: true },
        });
      }
      return tx.benchmarkAccount.update({ where: { id: survivor.id }, data });
    });
  }

  const data = mergeFetchedAccountData({ account: acc, result, input });
  return prisma.benchmarkAccount.create({ data: { userId, ...data } });
}

async function mergeDuplicateAccountNotes(
  tx: Prisma.TransactionClient,
  survivorId: string,
  duplicates: BenchmarkAccount[]
) {
  for (const duplicate of duplicates) {
    const notes = await tx.benchmarkNote.findMany({
      where: { accountId: duplicate.id },
    });
    for (const note of notes) {
      const existing = note.noteId
        ? await tx.benchmarkNote.findFirst({
            where: { accountId: survivorId, noteId: note.noteId },
          })
        : note.noteUrl
          ? await tx.benchmarkNote.findFirst({
              where: { accountId: survivorId, noteUrl: note.noteUrl },
            })
          : null;

      if (!existing) {
        await tx.benchmarkNote.update({
          where: { id: note.id },
          data: { accountId: survivorId },
        });
      }
    }
  }
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
