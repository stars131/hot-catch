import { describe, expect, it } from "vitest";
import {
  applySectionPatch,
  patchSectionLabel,
  readRevisionSectionText,
  readSectionText,
  resolvePatchScope,
  type PatchableDraft,
} from "@/lib/creator/patch-protocol";

const xhsDraft: PatchableDraft = {
  title: "裸辞 3 个月的真实记录",
  body: "完整正文第一段。完整正文第二段。",
  structured: {
    title: "裸辞 3 个月的真实记录",
    bodyText: "完整正文第一段。完整正文第二段。",
    interactionEnding: "你也有类似经历吗?评论区聊聊。",
    pages: [
      { pageNumber: 1, heading: "封面", body: "第一页正文" },
      { pageNumber: 2, heading: "转折", body: "第二页正文,包含要修改的句子。" },
    ],
    tags: ["职场", "裸辞"],
  },
};

const douyinDraft: PatchableDraft = {
  title: "30 秒讲清楚复盘方法",
  body: "发布文案",
  structured: {
    hook: "你是不是也这样?",
    caption: "发布文案",
    shots: [
      { startSec: 0, endSec: 5, voiceover: "开场口播", visual: "特写" },
      { startSec: 5, endSec: 12, voiceover: "第二镜口播", visual: "全景" },
    ],
  },
};

describe("readSectionText", () => {
  it("读取标题/正文/互动收尾/钩子", () => {
    expect(readSectionText(xhsDraft, { kind: "title" })).toBe(xhsDraft.title);
    expect(readSectionText(xhsDraft, { kind: "body" })).toBe(xhsDraft.body);
    expect(readSectionText(xhsDraft, { kind: "interaction" })).toContain("评论区");
    expect(readSectionText(douyinDraft, { kind: "hook" })).toBe("你是不是也这样?");
  });

  it("按下标读取分页与分镜;越界返回 null", () => {
    expect(readSectionText(xhsDraft, { kind: "page", index: 1 })).toContain("第二页正文");
    expect(readSectionText(douyinDraft, { kind: "shot", index: 0 })).toBe("开场口播");
    expect(readSectionText(xhsDraft, { kind: "page", index: 9 })).toBeNull();
    expect(readSectionText(douyinDraft, { kind: "shot" })).toBeNull();
  });

  it("无结构化数据时 hook/page 返回 null,title/body 仍可读", () => {
    const plain: PatchableDraft = { title: "t", body: "b", structured: null };
    expect(readSectionText(plain, { kind: "title" })).toBe("t");
    expect(readSectionText(plain, { kind: "hook" })).toBeNull();
    expect(readSectionText(plain, { kind: "page", index: 0 })).toBeNull();
  });

  it("readRevisionSectionText 接受修订版本形状", () => {
    expect(
      readRevisionSectionText(
        { title: "t", bodyText: "正文", structuredContent: xhsDraft.structured },
        { kind: "page", index: 0 },
      ),
    ).toBe("第一页正文");
  });
});

describe("applySectionPatch", () => {
  it("整块替换标题并同步 structured.title;原对象不被修改", () => {
    const next = applySectionPatch(xhsDraft, { kind: "title" }, "", "新标题");
    expect(next?.title).toBe("新标题");
    expect(next?.structured?.title).toBe("新标题");
    expect(xhsDraft.title).toBe("裸辞 3 个月的真实记录");
    expect(xhsDraft.structured?.title).toBe("裸辞 3 个月的真实记录");
  });

  it("只替换分页正文中第一处匹配的摘录", () => {
    const next = applySectionPatch(
      xhsDraft,
      { kind: "page", index: 1 },
      "要修改的句子",
      "已经改好的句子",
    );
    const pages = next?.structured?.pages as Array<{ body: string }>;
    expect(pages[1].body).toBe("第二页正文,包含已经改好的句子。");
    expect(pages[0].body).toBe("第一页正文");
  });

  it("摘录在区块中不存在时返回 null,不做任何修改", () => {
    expect(
      applySectionPatch(xhsDraft, { kind: "body" }, "根本不存在的文本", "替换"),
    ).toBeNull();
  });

  it("替换分镜口播时其他分镜保持不变", () => {
    const next = applySectionPatch(douyinDraft, { kind: "shot", index: 1 }, "", "新口播");
    const shots = next?.structured?.shots as Array<{ voiceover: string }>;
    expect(shots[1].voiceover).toBe("新口播");
    expect(shots[0].voiceover).toBe("开场口播");
  });

  it("无结构化数据时不能修改结构区块", () => {
    const plain: PatchableDraft = { title: "t", body: "b", structured: null };
    expect(applySectionPatch(plain, { kind: "hook" }, "", "x")).toBeNull();
    expect(applySectionPatch(plain, { kind: "body" }, "b", "c")?.body).toBe("c");
  });
});

describe("resolvePatchScope 与标签", () => {
  it("摘录能匹配时作用域是摘录,否则退化为整块", () => {
    expect(resolvePatchScope("abcdef", "cde")).toBe("cde");
    expect(resolvePatchScope("abcdef", "zzz")).toBe("abcdef");
    expect(resolvePatchScope("abcdef")).toBe("abcdef");
  });

  it("区块标签按平台区分正文名称", () => {
    expect(patchSectionLabel("xhs_graphic", { kind: "body" })).toBe("完整正文");
    expect(patchSectionLabel("douyin_video_script", { kind: "body" })).toBe("发布文案");
    expect(patchSectionLabel("xhs_graphic", { kind: "page", index: 2 })).toBe("第 3 页");
  });
});
