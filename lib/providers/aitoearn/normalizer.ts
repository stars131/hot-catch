import type {
  ProviderPublishRecord,
  ProviderPublishStatus,
  PublishingAccount,
} from "@/lib/providers/types";

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function unwrapData(value: unknown): unknown {
  const root = asRecord(value);
  return root.data ?? value;
}

export function normalizeAccounts(value: unknown): PublishingAccount[] {
  const data = asRecord(unwrapData(value));
  const list = Array.isArray(data.list) ? data.list : Array.isArray(value) ? value : [];
  return list.flatMap((item) => {
    const record = asRecord(item);
    const id = stringValue(record.id);
    const platform = stringValue(record.type).toLowerCase();
    if (!id || !["xiaohongshu", "douyin"].includes(platform)) return [];
    return [
      {
        id,
        platform: platform as "xiaohongshu" | "douyin",
        name: stringValue(record.nickname) || stringValue(record.account) || id,
        avatarUrl: stringValue(record.avatar) || undefined,
        status: numberValue(record.status) === 0 ? "active" : "expired",
        raw: item,
      } satisfies PublishingAccount,
    ];
  });
}

export function mapPublishStatus(status: unknown, workLink?: string): ProviderPublishStatus {
  if (workLink) return "published";
  const value = numberValue(status);
  if (value === 8) return "awaiting_user";
  if (value === 9) return "canceled";
  if (value === -1 || value === 5) return "failed";
  if (value === 0) return "scheduled";
  if (value === 1) return "uploading";
  if (value === 3 || value === 4 || value === 7) return "published";
  return "submitted";
}

export function normalizePublishRecord(value: unknown): ProviderPublishRecord {
  const data = asRecord(unwrapData(value));
  const recordId = stringValue(data.id) || stringValue(data.recordId) || stringValue(data.taskId);
  if (!recordId) throw new Error("AiToEarn response has no record id");
  const workLink = stringValue(data.workLink) || stringValue(data.publicUrl);
  const errorData = asRecord(data.errorData);
  return {
    flowId: stringValue(data.flowId) || undefined,
    recordId,
    status: mapPublishStatus(data.status, workLink),
    shortLink: stringValue(data.shortLink) || stringValue(data.userActionUrl) || undefined,
    publicUrl: workLink || undefined,
    failureCode: stringValue(errorData.code) || undefined,
    failureReason:
      stringValue(data.errorMsg) || stringValue(errorData.message) || undefined,
    raw: value,
  };
}

export function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return 0;
}
