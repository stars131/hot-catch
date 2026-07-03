import type { XhsFetchResult } from "@/lib/xhs/types";

export const MANUAL_REQUIRED_FIELDS = [
  "profileDescription",
  "recentNoteTitles",
  "sampleNotes",
  "learningReason",
];

export function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function createManualRequiredResult(input: string): XhsFetchResult {
  return {
    status: "manual_required",
    sourceType: "manual",
    dataConfidence: 0,
    errorMessage: `Manual input required for: ${input}`,
  };
}
