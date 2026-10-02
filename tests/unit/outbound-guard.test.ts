import { describe, expect, it } from "vitest";
import {
  outboundFieldsOf,
  scanOutboundText,
  type GuardField,
} from "@/lib/content/outbound-guard";
import {
  assertOutboundContentSafe,
  deploymentSecretLiterals,
} from "@/lib/content/outbound-guard-server";
import { assessContentReadiness } from "@/lib/creator/publish-readiness";

/**
 * 出站闸门:正例必须拦截或提醒,常见创作者文案必须放行。
 * 反例取自小红书/抖音常见写法,用于防止误伤正常内容。
 */

function body(text: string): GuardField[] {
  return [{ field: "body", label: "正文", text }];
}

function categoriesOf(text: string, literals?: string[]) {
  return scanOutboundText(body(text), { secretLiterals: literals }).findings.map(
    (finding) => `${finding.severity}:${finding.category}`,
  );
}

const FAKE_DEEPSEEK_KEY = "sk-" + "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

describe("block 级:不应公开的信息", () => {
  it.each([
    ["模型 API Key", `配置好 ${FAKE_DEEPSEEK_KEY} 就能用`, "credential"],
    ["GitHub Token", "token: ghp_" + "A".repeat(36), "credential"],
    ["AWS Key", "AKIA" + "ABCDEFGHIJKLMNOP", "credential"],
    ["Bearer", "请求头 Authorization: Bearer abcdefghijklmnop1234", "credential"],
    ["中文键值", "接口密钥：Zx81kd0QpLmn", "credential"],
    ["连接串", "postgresql://xhs:xhs_password@127.0.0.1:5432/xhs_benchmark", "connection-string"],
    ["星迹配置名", "记得先设置 CREDENTIAL_ENCRYPTION_KEY", "env-name"],
    ["热点 Cookie 配置名", "HOTSPOT_XIAOHONGSHU_COOKIE 已过期", "env-name"],
    ["模板变量", "今天聊聊 {{topic}} 的三个误区", "template-residue"],
    ["代码插值", "适合 ${audience} 的通勤穿搭", "template-residue"],
    ["占位提示", "第一步【此处插入产品名称】打开设置", "template-residue"],
    ["TODO", "[TODO 补充数据] 结论先放这里", "template-residue"],
  ])("%s", (_name, text, category) => {
    const result = scanOutboundText(body(text));
    expect(result.blocked).toBe(true);
    expect(result.findings.map((finding) => finding.category)).toContain(category);
  });

  it("精确匹配部署真实密钥值,摘要中不回显完整值", () => {
    const secret = "prod-secret-value-9f3k2";
    const result = scanOutboundText(body(`结尾彩蛋 ${secret} 哈哈`), { secretLiterals: [secret] });
    expect(result.blocked).toBe(true);
    expect(result.findings[0].category).toBe("env-value");
    expect(result.findings[0].excerpt).not.toContain(secret);
  });

  it("密钥摘要打码,同一密钥只报告一次", () => {
    const result = scanOutboundText(body(`api_key=${FAKE_DEEPSEEK_KEY}`));
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].excerpt).not.toContain(FAKE_DEEPSEEK_KEY);
  });
});

describe("warn 级:提醒但不拦截", () => {
  it.each([
    ["助手腔", "作为一个AI语言模型，我建议你先列清单", "ai-self-reference"],
    ["生成前言", "以下是为你生成的小红书文案", "ai-self-reference"],
    ["英文助手腔", "As an AI language model I cannot", "ai-self-reference"],
    ["Markdown 粗体", "这三步**一定要做**", "format-residue"],
    ["代码块", "```json\n{}\n```", "format-residue"],
    ["本机地址", "打开 http://localhost:3000/creator 就能看到", "private-host"],
    ["路由器后台", "浏览器输入 http://192.168.1.1 登录路由器", "private-host"],
    ["通用变量名", "教程:把 OPENAI_API_KEY 写进环境变量", "env-name"],
  ])("%s", (_name, text, category) => {
    const result = scanOutboundText(body(text));
    expect(result.blocked).toBe(false);
    expect(result.findings.map((finding) => finding.category)).toContain(category);
  });
});

describe("常见创作者文案必须放行", () => {
  it.each([
    "面试完不复盘，同样的问题会再犯一遍。#求职 #面试复盘",
    "SK-II 神仙水真的值得回购吗？用了三个月说说真实感受",
    "本条内容由AI生成，已人工核对。",
    "作为AI产品经理，我每天会看这几个指标",
    "最近在学密码学，推荐这本入门书",
    "原价¥399，到手价¥199，链接放评论区了～",
    "完整教程：https://www.xiaohongshu.com/explore/66a1b2c3d4e5f6",
    "1. 先定目标 2. 再拆步骤 3. 每周复盘",
    "第3页有彩蛋【收藏】【点赞】【关注】",
    "Wi-Fi 信号差？换个位置就好",
  ])("%s", (text) => {
    expect(categoriesOf(text)).toEqual([]);
  });
});

describe("字段展开", () => {
  it("小红书展开分页、封面文案与互动结尾,定位到具体页", () => {
    const fields = outboundFieldsOf({
      contentKind: "xhs_graphic",
      title: "标题",
      body: "正文",
      structured: {
        pages: [{ heading: "开场", body: "正常" }, { heading: "方法", body: "用 {{tool}} 做记录" }],
        coverTextOptions: ["封面"],
        interactionEnding: "你会怎么做？",
        tags: ["求职"],
      },
    });
    const result = scanOutboundText(fields);
    expect(result.blocked).toBe(true);
    expect(result.findings[0].fieldLabel).toBe("第 2 页正文");
  });

  it("抖音展开钩子、口播与字幕", () => {
    const fields = outboundFieldsOf({
      contentKind: "douyin_video_script",
      title: "标题",
      body: "文案",
      structured: { hook: "开场", shots: [{ voiceover: "口播", subtitle: `密钥：${"x".repeat(12)}` }] },
    });
    expect(scanOutboundText(fields).findings[0].fieldLabel).toBe("第 1 镜字幕");
  });
});

describe("服务端发布闸门", () => {
  it("block 级命中时抛出 422,details 只含打码摘要", () => {
    let thrown: unknown;
    try {
      assertOutboundContentSafe([{ field: "body", label: "正文与话题", text: `key ${FAKE_DEEPSEEK_KEY}` }]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 422,
      details: { reason: "outbound_guard", failureCode: "CONTENT_GUARD_BLOCKED" },
    });
    expect(JSON.stringify(thrown)).not.toContain(FAKE_DEEPSEEK_KEY);
  });

  it("只有 warn 级命中时放行", () => {
    expect(
      assertOutboundContentSafe([{ field: "body", label: "正文", text: "这三步**一定要做**" }]).blocked,
    ).toBe(false);
  });

  it("只收集敏感配置的真实值", () => {
    const literals = deploymentSecretLiterals({
      DEEPSEEK_API_KEY: "real-deepseek-key-123",
      AUTH_SECRET: "auth-secret-value",
      DATABASE_URL: "postgresql://u:p@db:5432/x",
      NODE_ENV: "production",
      SHORT_KEY: "abc",
    } as NodeJS.ProcessEnv);
    expect(literals.sort()).toEqual(
      ["auth-secret-value", "postgresql://u:p@db:5432/x", "real-deepseek-key-123"].sort(),
    );
  });
});

describe("就绪清单接入", () => {
  it("模板残留让小红书草稿进入 blocked,并指出位置", () => {
    const assessment = assessContentReadiness({
      contentKind: "xhs_graphic",
      title: "AI 面试复盘三步法",
      body: "面试完不复盘,同样的问题会再犯一遍。".repeat(5),
      structured: {
        pages: [{ pageNumber: 1, heading: "开场", body: "适合 {{audience}} 的方法。" }],
        tags: ["求职", "复盘", "面试"],
      },
    });
    const item = assessment.items.find((entry) => entry.key === "outbound");
    expect(assessment.state).toBe("blocked");
    expect(item?.level).toBe("block");
    expect(item?.detail).toContain("第 1 页正文");
  });

  it("助手腔只提醒,不阻塞抖音脚本", () => {
    const assessment = assessContentReadiness({
      contentKind: "douyin_video_script",
      title: "面试复盘 30 秒讲清",
      body: "以下是为你生成的抖音文案,面试复盘方法。",
      structured: {
        hook: "面试完直接投下一家?",
        durationSec: 30,
        shots: [{ startSec: 0, endSec: 30, voiceover: "方法。" }],
        tags: ["求职", "面试", "复盘"],
      },
    });
    expect(assessment.items.find((entry) => entry.key === "outbound")?.level).toBe("warn");
    expect(assessment.blockers).toBe(0);
  });
});
