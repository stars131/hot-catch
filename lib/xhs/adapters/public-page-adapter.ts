import type { XhsDataAdapter } from "@/lib/xhs/types";
import { createManualRequiredResult } from "@/lib/xhs/adapters/base";

export const publicPageAdapter: XhsDataAdapter = {
  name: "public_page",
  fetchAccountByProfileUrl: async (url) => createManualRequiredResult(url),
  fetchNoteByUrl: async (url) => createManualRequiredResult(url),
};
