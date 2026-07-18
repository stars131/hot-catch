export type WorkspaceStatus = "ready" | "planned";

export type WorkspaceKind = "hotspots" | "creator";

export type CreatorPlatformCode =
  | "xiaohongshu"
  | "douyin"
  | "kuaishou"
  | "shipinhao";

export type WorkspaceApiSurface = {
  namespace?: string;
  chat?: string;
  benchmarkAccounts?: string;
  contentGenerate?: string;
  contentSave?: string;
  contentList?: string;
  hotspots?: string;
  hotspotCookies?: string;
};

export type WorkspaceDefinition = {
  id: string;
  kind: WorkspaceKind;
  label: string;
  description: string;
  href: string;
  status: WorkspaceStatus;
  platform?: CreatorPlatformCode;
  api: WorkspaceApiSurface;
};

export type WorkspaceSwitcherGroup = {
  id: string;
  label: string;
  items: WorkspaceDefinition[];
};

export const hotspotWorkspace: WorkspaceDefinition = {
  id: "hotspots",
  kind: "hotspots",
  label: "热点雷达",
  description: "趋势、榜单、来源状态",
  href: "/hotspots",
  status: "ready",
  api: {
    hotspots: "/api/hotspots",
    hotspotCookies: "/api/hotspots/cookies",
  },
};

export const creatorWorkspaces: WorkspaceDefinition[] = [
  {
    id: "creator.xiaohongshu",
    kind: "creator",
    platform: "xiaohongshu",
    label: "小红书内容创作",
    description: "对标分析、图文生成",
    href: "/creator/xiaohongshu",
    status: "ready",
    api: {
      chat: "/api/chat",
      benchmarkAccounts: "/api/benchmark/accounts",
      contentGenerate: "/api/content/generate",
      contentSave: "/api/content/save",
      contentList: "/api/content/list",
    },
  },
  {
    id: "creator.douyin",
    kind: "creator",
    platform: "douyin",
    label: "抖音内容创作",
    description: "精确分镜、版本与评分",
    href: "/creator/douyin",
    status: "ready",
    api: {
      chat: "/api/chat",
      benchmarkAccounts: "/api/benchmark/accounts",
      contentGenerate: "/api/content",
      contentSave: "/api/content/[id]/revisions",
      contentList: "/api/content/list",
    },
  },
  {
    id: "creator.kuaishou",
    kind: "creator",
    platform: "kuaishou",
    label: "快手内容创作",
    description: "人设口播、系列选题",
    href: "/creator/kuaishou",
    status: "planned",
    api: {
      namespace: "/api/creators/kuaishou",
    },
  },
  {
    id: "creator.shipinhao",
    kind: "creator",
    platform: "shipinhao",
    label: "视频号内容创作",
    description: "私域转化、图文视频复用",
    href: "/creator/shipinhao",
    status: "planned",
    api: {
      namespace: "/api/creators/shipinhao",
    },
  },
];

export const workspaceSwitcherGroups: WorkspaceSwitcherGroup[] = [
  {
    id: "entry",
    label: "信息入口",
    items: [hotspotWorkspace],
  },
  {
    id: "creator",
    label: "平台创作",
    items: creatorWorkspaces,
  },
];

export const workspaceDefinitions = workspaceSwitcherGroups.flatMap((group) => group.items);

export function getWorkspaceById(id: string) {
  return workspaceDefinitions.find((workspace) => workspace.id === id);
}
