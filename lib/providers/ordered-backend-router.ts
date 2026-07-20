export type BackendAvailability =
  | { available: true }
  | { available: false; reason: string };

export type BackendAttempt = {
  backend: string;
  status: "skipped" | "failed" | "succeeded";
  reason?: string;
};

export type OrderedBackendCandidate<T> = {
  id: string;
  availability?: BackendAvailability | (() => Promise<BackendAvailability>);
  failureReason: string;
  run: () => Promise<T>;
};

export type OrderedBackendResult<T> =
  | {
      ok: true;
      value: T;
      activeBackend: string;
      attempts: BackendAttempt[];
    }
  | {
      ok: false;
      attempts: BackendAttempt[];
    };

/**
 * 按声明顺序尝试后端。单个后端的配置缺失或执行失败不会阻断后续候选，
 * 返回值只保留稳定原因码，避免把供应商响应或凭证相关细节带入业务数据。
 */
export async function runOrderedBackends<T>(
  candidates: ReadonlyArray<OrderedBackendCandidate<T>>,
  options?: { preferredBackend?: string },
): Promise<OrderedBackendResult<T>> {
  assertUniqueBackendIds(candidates);
  const ordered = orderCandidates(candidates, options?.preferredBackend);
  const attempts: BackendAttempt[] = [];

  for (const candidate of ordered) {
    const availability =
      typeof candidate.availability === "function"
        ? await candidate.availability()
        : candidate.availability;
    if (availability?.available === false) {
      attempts.push({
        backend: candidate.id,
        status: "skipped",
        reason: availability.reason,
      });
      continue;
    }

    try {
      const value = await candidate.run();
      attempts.push({ backend: candidate.id, status: "succeeded" });
      return {
        ok: true,
        value,
        activeBackend: candidate.id,
        attempts,
      };
    } catch {
      attempts.push({
        backend: candidate.id,
        status: "failed",
        reason: candidate.failureReason,
      });
    }
  }

  return { ok: false, attempts };
}

function orderCandidates<T>(
  candidates: ReadonlyArray<OrderedBackendCandidate<T>>,
  preferredBackend?: string,
): OrderedBackendCandidate<T>[] {
  const ordered = [...candidates];
  if (!preferredBackend) return ordered;
  const preferredIndex = ordered.findIndex((candidate) => candidate.id === preferredBackend);
  if (preferredIndex <= 0) return ordered;
  const [preferred] = ordered.splice(preferredIndex, 1);
  ordered.unshift(preferred);
  return ordered;
}

function assertUniqueBackendIds<T>(candidates: ReadonlyArray<OrderedBackendCandidate<T>>) {
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (ids.has(candidate.id)) {
      throw new Error(`Duplicate backend id: ${candidate.id}`);
    }
    ids.add(candidate.id);
  }
}
