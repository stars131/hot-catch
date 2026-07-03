export type XhsFetchInput =
  | { type: "xhs_id"; value: string }
  | { type: "profile_url"; value: string }
  | { type: "note_url"; value: string };

export type XhsFetchStatus = "success" | "partial" | "failed" | "manual_required";

export type XhsRawNote = {
  noteId?: string;
  noteUrl?: string;
  title?: string;
  content?: string;
  coverUrl?: string;
  imageUrls?: string[];
  tags?: string[];
  likeCount?: number;
  collectCount?: number;
  commentCount?: number;
  shareCount?: number;
  publishedAt?: string | Date;
};

export type XhsRawAccount = {
  xhsId?: string;
  nickname?: string;
  avatarUrl?: string;
  profileUrl?: string;
  description?: string;
  category?: string;
  followerCount?: number;
  followingCount?: number;
  likedCount?: number;
  noteCount?: number;
  location?: string;
  verifiedInfo?: string;
  recentNotes?: XhsRawNote[];
};

export type NormalizedXhsNote = XhsRawNote;
export type NormalizedXhsAccount = XhsRawAccount;

export type XhsFetchResult = {
  status: XhsFetchStatus;
  sourceType: string;
  dataConfidence: number;
  account?: XhsRawAccount;
  note?: XhsRawNote;
  errorMessage?: string;
  rawData?: unknown;
};

export type XhsDataAdapter = {
  name: string;
  fetchAccountById?: (id: string) => Promise<XhsFetchResult>;
  fetchAccountByProfileUrl?: (url: string) => Promise<XhsFetchResult>;
  fetchNoteByUrl?: (url: string) => Promise<XhsFetchResult>;
};
