import { describe, expect, it } from "vitest";
import {
  buildManualRevisionPayload,
  toDouyinMarkdown,
  toXhsMarkdown,
} from "@/lib/content/markdown";
import {
  artifactItemAnchor,
  artifactSectionLabel,
  buildSectionRefinePrompt,
  scoreTargetOf,
} from "@/lib/creator/artifact-locator";

describe("markdown builders", () => {
  it("renders xhs pages, body and tags", () => {
    const markdown = toXhsMarkdown({
      title: "裸辞复盘",
      pages: [
        { pageNumber: 1, heading: "开场", body: "第一页内容" },
        { pageNumber: 2, heading: "方法", body: "第二页内容" },
      ],
      bodyText: "完整正文",
      tags: ["职场", "复盘"],
    });
    expect(markdown).toContain("# 裸辞复盘");
    expect(markdown).toContain("## 第 1 页：开场");
    expect(markdown).toContain("第二页内容");
    expect(markdown).toContain("#职场 #复盘");
  });

  it("renders douyin shots as a timeline table", () => {
    const markdown = toDouyinMarkdown({
      title: "三十秒效率",
      shots: [
        {
          startSec: 0,
          endSec: 3,
          voiceover: "开场口播",
          visual: "特写",
          subtitle: "开场",
          camera: "近景",
          transition: "切",
          music: "轻快",
          risk: "",
        },
      ],
      caption: "发布文案",
      tags: ["效率"],
    });
    expect(markdown).toContain("| 时间 | 口播 | 画面 | 字幕 |");
    expect(markdown).toContain("| 0-3s | 开场口播 | 特写 | 开场 | 近景 | 切 | 轻快 | 无 |");
    expect(markdown).toContain("发布文案");
  });
});

describe("buildManualRevisionPayload", () => {
  const xhsStructured = {
    title: "旧标题",
    bodyText: "旧正文",
    pages: [{ pageNumber: 1, heading: "第一页", body: "页面内容", visualSuggestion: "大字" }],
    tags: ["职场"],
    interactionEnding: "评论区聊聊",
    riskNotes: ["避免绝对化"],
  };

  it("merges edited title/body into xhs structured content and rebuilds markdown", () => {
    const payload = buildManualRevisionPayload({
      contentKind: "xhs_graphic",
      baseStructuredContent: xhsStructured,
      title: "新标题",
      bodyText: "新正文",
    });
    const structured = payload.structuredContent as Record<string, unknown>;
    expect(payload.title).toBe("新标题");
    expect(payload.bodyText).toBe("新正文");
    expect(structured.title).toBe("新标题");
    expect(structured.bodyText).toBe("新正文");
    // 未被编辑的结构字段原样保留
    expect(structured.pages).toEqual(xhsStructured.pages);
    expect(structured.interactionEnding).toBe("评论区聊聊");
    expect(payload.fullMarkdown).toContain("# 新标题");
    expect(payload.fullMarkdown).toContain("## 第 1 页：第一页");
    expect(payload.fullMarkdown).toContain("新正文");
  });

  it("rebuilds markdown from structurally edited pages (C6 editor)", () => {
    const edited = {
      ...xhsStructured,
      pages: [
        { pageNumber: 1, heading: "重写的第一页", body: "新的页面内容", visualSuggestion: "大字" },
        { pageNumber: 2, heading: "新增的第二页", body: "补充内容", visualSuggestion: "" },
      ],
      tags: ["职场", "复盘"],
    };
    const payload = buildManualRevisionPayload({
      contentKind: "xhs_graphic",
      baseStructuredContent: edited,
      title: "新标题",
      bodyText: "正文",
    });
    expect(payload.fullMarkdown).toContain("## 第 1 页：重写的第一页");
    expect(payload.fullMarkdown).toContain("## 第 2 页：新增的第二页");
    expect(payload.fullMarkdown).toContain("#职场 #复盘");
    expect((payload.structuredContent as Record<string, unknown>).pages).toEqual(
      edited.pages,
    );
  });

  it("drops empty rows from string lists but keeps working pages", () => {
    const payload = buildManualRevisionPayload({
      contentKind: "xhs_graphic",
      baseStructuredContent: {
        ...xhsStructured,
        tags: ["职场", "", "  "],
        riskNotes: ["避免绝对化", ""],
        coverTextOptions: ["封面", ""],
        pages: [{ pageNumber: 1, heading: "", body: "", visualSuggestion: "" }],
      },
      title: "标题标题",
      bodyText: "正文",
    });
    const structured = payload.structuredContent as Record<string, unknown>;
    expect(structured.tags).toEqual(["职场"]);
    expect(structured.riskNotes).toEqual(["避免绝对化"]);
    expect(structured.coverTextOptions).toEqual(["封面"]);
    // 编辑中的空白页保留,由用户显式删除
    expect(structured.pages).toHaveLength(1);
  });

  it("writes douyin body edits into caption and keeps shots", () => {
    const base = {
      title: "旧标题",
      caption: "旧文案",
      durationSec: 30,
      shots: [
        {
          startSec: 0,
          endSec: 30,
          voiceover: "口播",
          visual: "画面",
          subtitle: "字幕",
          camera: "近景",
          transition: "切",
          music: "轻快",
          risk: "",
        },
      ],
      tags: ["效率"],
    };
    const payload = buildManualRevisionPayload({
      contentKind: "douyin_video_script",
      baseStructuredContent: base,
      title: "新标题",
      bodyText: "新文案",
    });
    const structured = payload.structuredContent as Record<string, unknown>;
    expect(structured.caption).toBe("新文案");
    expect(structured.shots).toEqual(base.shots);
    expect(payload.fullMarkdown).toContain("| 0-30s | 口播 |");
    expect(payload.fullMarkdown).toContain("新文案");
  });

  it("rebuilds an edited X thread and derives body text from its posts", () => {
    const payload = buildManualRevisionPayload({
      contentKind: "x_thread",
      baseStructuredContent: {
        title: "Thread",
        posts: [
          { index: 1, text: "Edited opening", mediaSuggestion: "Source map" },
          { index: 2, text: "Edited conclusion", mediaSuggestion: "" },
        ],
        callToAction: "What would you verify?",
      },
      title: "Edited thread",
      bodyText: "stale body from the generated revision",
    });
    expect(payload.bodyText).toBe("Edited opening\n\nEdited conclusion");
    expect(payload.fullMarkdown).toContain("## 1/2\n\nEdited opening");
    expect(payload.fullMarkdown).toContain("**Media:** Source map");
    expect(payload.fullMarkdown).not.toContain("stale body");
  });

  it("keeps global platform body fields aligned with the structured content", () => {
    const youtube = buildManualRevisionPayload({
      contentKind: "youtube_video_package",
      baseStructuredContent: {
        title: "Video",
        thumbnailText: "Watch this",
        sections: [{ startSec: 0, endSec: 30, heading: "Opening", narration: "New narration", visualDirection: "Source map" }],
        chapters: [{ timeSec: 0, title: "Opening" }],
        description: "Old description",
        tags: ["research"],
      },
      title: "Video",
      bodyText: "New description",
    });
    expect((youtube.structuredContent as Record<string, unknown>).description).toBe("New description");
    expect(youtube.fullMarkdown).toContain("New narration");
    expect(youtube.fullMarkdown).toContain("## Description\n\nNew description");

    const reddit = buildManualRevisionPayload({
      contentKind: "reddit_post",
      baseStructuredContent: { title: "Question", bodyMarkdown: "Old", subredditSuggestions: ["research", ""] },
      title: "Question",
      bodyText: "New Markdown body",
    });
    expect((reddit.structuredContent as Record<string, unknown>).bodyMarkdown).toBe("New Markdown body");
    expect((reddit.structuredContent as Record<string, unknown>).subredditSuggestions).toEqual(["research"]);
    expect(reddit.fullMarkdown).toContain("New Markdown body");
  });

  it("falls back to simple markdown when no structured content exists", () => {
    const payload = buildManualRevisionPayload({
      contentKind: "xhs_graphic",
      baseStructuredContent: null,
      title: "手写稿",
      bodyText: "只有正文",
    });
    expect(payload.structuredContent).toBeUndefined();
    expect(payload.fullMarkdown).toBe("# 手写稿\n\n只有正文");
  });

  it("normalizes empty title to null", () => {
    const payload = buildManualRevisionPayload({
      contentKind: "xhs_graphic",
      baseStructuredContent: null,
      title: "   ",
      bodyText: "正文",
    });
    expect(payload.title).toBeNull();
  });
});

describe("scoreTargetOf", () => {
  it("maps every xhs scoring dimension to a locatable block", () => {
    for (const key of ["hook", "value", "structure", "visual", "interaction", "safety"]) {
      const target = scoreTargetOf("xhs_graphic", key);
      expect(target, `xhs dimension ${key}`).not.toBeNull();
      expect(["content", "structure"]).toContain(target!.tab);
    }
    // C6:结构与视觉警告直接定位到「内容」标签中可编辑的分页块
    expect(scoreTargetOf("xhs_graphic", "structure")).toMatchObject({
      tab: "content",
      blockId: "pages",
    });
  });

  it("maps every douyin scoring dimension to a locatable block", () => {
    for (const key of ["hook", "value", "timeline", "visual", "audio", "safety"]) {
      const target = scoreTargetOf("douyin_video_script", key);
      expect(target, `douyin dimension ${key}`).not.toBeNull();
      expect(["content", "structure"]).toContain(target!.tab);
    }
    expect(scoreTargetOf("douyin_video_script", "timeline")).toMatchObject({
      tab: "content",
      blockId: "shots",
    });
  });

  it("returns null for unknown dimensions instead of guessing", () => {
    expect(scoreTargetOf("xhs_graphic", "unknown")).toBeNull();
    expect(scoreTargetOf("xhs_graphic", "__proto__")).toBeNull();
  });
});

describe("artifact section refine protocol", () => {
  it("labels repeated blocks with 1-based position and optional detail", () => {
    expect(artifactSectionLabel("xhs_graphic", { kind: "page", index: 1 }, "方法")).toBe(
      "第 2 页「方法」",
    );
    expect(
      artifactSectionLabel("douyin_video_script", { kind: "shot", index: 0 }, "0s–3s"),
    ).toBe("第 1 镜(0s–3s)");
    expect(artifactSectionLabel("xhs_graphic", { kind: "body" })).toBe("完整正文");
    expect(artifactSectionLabel("douyin_video_script", { kind: "body" })).toBe("发布文案");
  });

  it("builds a stable composer prefix with revision number", () => {
    expect(
      buildSectionRefinePrompt({
        contentKind: "xhs_graphic",
        section: { kind: "page", index: 2 },
        revisionNumber: 4,
        detail: "结尾",
      }),
    ).toBe("请修改第 3 页「结尾」(当前 v4):");
  });

  it("keeps a normalized excerpt when text was selected", () => {
    const prompt = buildSectionRefinePrompt({
      contentKind: "xhs_graphic",
      section: { kind: "body" },
      revisionNumber: 2,
      excerpt: "  这句话\n太生硬了  ",
    });
    expect(prompt).toBe("请修改完整正文(当前 v2)中选中的这段:「这句话 太生硬了」,");
  });

  it("truncates long excerpts and omits empty ones", () => {
    const long = "长".repeat(120);
    const prompt = buildSectionRefinePrompt({
      contentKind: "douyin_video_script",
      section: { kind: "shot", index: 4 },
      excerpt: long,
    });
    expect(prompt).toContain("…");
    expect(prompt.length).toBeLessThan(120);
    expect(
      buildSectionRefinePrompt({
        contentKind: "douyin_video_script",
        section: { kind: "hook" },
        excerpt: "   ",
      }),
    ).toBe("请修改开场钩子:");
  });

  it("exposes stable per-item anchors for outline jumps", () => {
    expect(artifactItemAnchor("pages", 0)).toBe("artifact-block-pages-1");
    expect(artifactItemAnchor("shots", 2)).toBe("artifact-block-shots-3");
  });
});
