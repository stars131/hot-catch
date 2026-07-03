import type { XhsDataAdapter } from "@/lib/xhs/types";
import { createManualRequiredResult } from "@/lib/xhs/adapters/base";

export const thirdPartyAdapter: XhsDataAdapter = {
  name: "third_party",
  fetchAccountById: async (id) => createManualRequiredResult(id),
  fetchAccountByProfileUrl: async (url) => createManualRequiredResult(url),
  fetchNoteByUrl: async (url) => createManualRequiredResult(url),
};
