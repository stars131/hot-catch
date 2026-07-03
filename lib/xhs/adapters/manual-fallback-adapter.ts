import type { XhsDataAdapter } from "@/lib/xhs/types";
import { createManualRequiredResult } from "@/lib/xhs/adapters/base";

export const manualFallbackAdapter: XhsDataAdapter = {
  name: "manual",
  fetchAccountById: async (id) => createManualRequiredResult(id),
  fetchAccountByProfileUrl: async (url) => createManualRequiredResult(url),
  fetchNoteByUrl: async (url) => createManualRequiredResult(url),
};
