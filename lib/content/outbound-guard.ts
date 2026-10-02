/**
 * 出站内容安全闸门(纯函数,无数据库、无网络,前后端共用)。
 *
 * 发布到小红书/抖音的文字一旦公开就很难撤回。模型输出偶尔会把内部配置、
 * 模板占位符或助手腔带进正文,这里在发布前做确定性扫描。
 *
 * 分级:
 * - block:几乎没有正当理由出现在公开内容里(密钥、带口令的连接串、
 *   星迹自身的环境变量名与真实值、未替换的模板占位符)。服务端发布入口会拒绝。
 * - warn:在科普、教程类内容里可能是正常表达(私网地址、通用环境变量名、
 *   AI 自称、Markdown 残留),只提醒,交给用户判断。
 *
 * 规则来源:分级思路参考 Easel `skills/shared/scripts/content_guard.py`;
 * 密钥格式取自 gitleaks `config/gitleaks.toml` 的对应规则并做了收窄。
 * 「由 AI 生成」类标识不报警:平台和法规可能要求主动标注 AI 生成内容。
 */

export type GuardSeverity = "block" | "warn";

export type GuardCategory =
  | "credential"
  | "connection-string"
  | "env-name"
  | "env-value"
  | "template-residue"
  | "private-host"
  | "ai-self-reference"
  | "format-residue";

export type GuardField = {
  /** 稳定字段键,如 title / body / pages.2.body / shots.0.voiceover */
  field: string;
  /** 面向用户的位置描述,如「标题」「第 3 页正文」 */
  label: string;
  text: string;
};

export type GuardFinding = {
  category: GuardCategory;
  severity: GuardSeverity;
  hint: string;
  field: string;
  fieldLabel: string;
  /** 命中上下文,命中片段本身已打码,不回显完整密钥 */
  excerpt: string;
};

export type GuardResult = {
  findings: GuardFinding[];
  blocked: boolean;
};

type GuardRule = {
  category: GuardCategory;
  severity: GuardSeverity;
  pattern: RegExp;
  hint: string;
  /** 命中片段本身不是秘密时,摘要中保留原文便于定位 */
  reveal?: boolean;
};

const SECRET_ASSIGNMENT =
  /(?:api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key|client[_-]?secret|password|passwd|密钥|口令|密码)\s*[:=：]\s*["'“]?[A-Za-z0-9_./+=-]{8,}/gi;

// 星迹自身的服务端配置名:只会因泄露出现在公开内容里
const XINGJI_ENV_NAMES =
  /\b(?:DATABASE_URL|REDIS_URL|AUTH_SECRET|AUTH_RESEND_KEY|CREDENTIAL_ENCRYPTION_KEY|DEEPSEEK_API_KEY|DEEPSEEK_BASE_URL|XHS_THIRD_PARTY_API_KEY|XHS_THIRD_PARTY_BASE_URL|POSTGRES_PASSWORD|DASHSCOPE_[A-Z_]+|TIKHUB_[A-Z_]+|AITO_EARN_[A-Z_]+|FIRECRAWL_[A-Z_]+|HOTSPOT_[A-Z0-9_]+_(?:COOKIE|UPSTREAM)|PUBLISH_PROVIDER_MODE|DEV_AUTH_BYPASS)\b/g;

const RULES: GuardRule[] = [
  // ── 密钥(gitleaks 规则收窄) ──
  { category: "credential", severity: "block", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, hint: "疑似 Anthropic API Key" },
  { category: "credential", severity: "block", pattern: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, hint: "疑似模型服务 API Key(sk- 开头)" },
  { category: "credential", severity: "block", pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/g, hint: "疑似 GitHub Token" },
  { category: "credential", severity: "block", pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[A-Z2-7]{16}\b/g, hint: "疑似 AWS Access Key" },
  { category: "credential", severity: "block", pattern: /\bAIza[\w-]{35}/g, hint: "疑似 Google API Key" },
  { category: "credential", severity: "block", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, hint: "疑似 Slack Token" },
  { category: "credential", severity: "block", pattern: /\bey[A-Za-z0-9_-]{17,}\.ey[A-Za-z0-9_-]{17,}\.[A-Za-z0-9_-]{10,}/g, hint: "疑似 JWT 令牌" },
  { category: "credential", severity: "block", pattern: /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY-----/g, hint: "私钥文件内容" },
  { category: "credential", severity: "block", pattern: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi, hint: "Bearer 令牌" },
  { category: "credential", severity: "block", pattern: SECRET_ASSIGNMENT, hint: "键值形式的密钥或口令" },
  // ── 带口令的连接串 ──
  {
    category: "connection-string",
    severity: "block",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi,
    hint: "带账号口令的数据库或队列连接串",
  },
  // ── 内部配置名 ──
  { category: "env-name", severity: "block", pattern: XINGJI_ENV_NAMES, hint: "星迹服务端配置名", reveal: true },
  {
    category: "env-name",
    severity: "warn",
    pattern: /\b(?:OPENAI_API_KEY|ANTHROPIC_[A-Z_]+|GEMINI_API_KEY|AWS_SECRET_ACCESS_KEY)\b/g,
    hint: "通用密钥环境变量名;教程里正常出现时可忽略",
    reveal: true,
  },
  // ── 模板残留 ──
  { category: "template-residue", severity: "block", pattern: /\{\{\s*[^{}\s][^{}]{0,40}\}\}/g, hint: "未替换的模板变量", reveal: true },
  { category: "template-residue", severity: "block", pattern: /\$\{[A-Za-z_][\w.]{0,40}\}/g, hint: "未替换的代码插值", reveal: true },
  {
    category: "template-residue",
    severity: "block",
    pattern: /[【[]\s*(?:(?:此处|这里|在此)\s*)?(?:插入|填写|替换|补充|添加)[^】\]\n]{0,20}[】\]]/g,
    hint: "未填写的占位提示",
    reveal: true,
  },
  { category: "template-residue", severity: "block", pattern: /\[(?:TODO|TBD|PLACEHOLDER)\b[^\]\n]{0,30}\]|\blorem ipsum\b/gi, hint: "未完成的占位文本", reveal: true },
  // ── 私网地址(路由器教程等可能正常出现) ──
  {
    category: "private-host",
    severity: "warn",
    pattern:
      /\bhttps?:\/\/(?:localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3}|0\.0\.0\.0|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:internal|local|lan))(?::\d{2,5})?\S*/gi,
    hint: "本机或内网地址,外部读者无法访问",
    reveal: true,
  },
  // ── 助手腔与格式残留 ──
  {
    category: "ai-self-reference",
    severity: "warn",
    pattern:
      /(?:作为|身为|我是)(?:一[个名款])?\s*(?:AI|人工智能|大语言模型|语言模型)(?:语言模型|助手|模型)?[,，、]|(?:以下是|下面是)(?:我)?(?:为你|为您)(?:生成|撰写|创作|准备)的|\bAs an AI(?: language model)?\b|\bI(?:'m| am) an AI\b/gi,
    hint: "模型自称或助手腔,读起来不像本人发布",
    reveal: true,
  },
  { category: "format-residue", severity: "warn", pattern: /```/g, hint: "代码块标记,平台不会渲染", reveal: true },
  { category: "format-residue", severity: "warn", pattern: /\*\*[^*\n]{1,40}\*\*|^#{1,6}\s+\S/gm, hint: "Markdown 标记,平台会原样显示星号或井号", reveal: true },
  { category: "format-residue", severity: "warn", pattern: /^\s*[{[]\s*"[A-Za-z_]+"\s*:/gm, hint: "JSON 结构残留", reveal: true },
];

const CATEGORY_LABEL: Record<GuardCategory, string> = {
  credential: "密钥",
  "connection-string": "连接串",
  "env-name": "配置名",
  "env-value": "配置真实值",
  "template-residue": "模板残留",
  "private-host": "内网地址",
  "ai-self-reference": "助手腔",
  "format-residue": "格式残留",
};

export function guardCategoryLabel(category: GuardCategory): string {
  return CATEGORY_LABEL[category];
}

/** 打码命中值:保留首尾少量字符,避免检查结果本身再次泄露。 */
function mask(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 8) return `${trimmed.slice(0, 1)}***`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-2)}`;
}

function excerptOf(text: string, start: number, end: number, reveal: boolean): string {
  const context = 10;
  const from = Math.max(0, start - context);
  const to = Math.min(text.length, end + context);
  const hit = text.slice(start, end);
  const shown = reveal ? (hit.length > 40 ? `${hit.slice(0, 40)}…` : hit) : mask(hit);
  const before = text.slice(from, start).replace(/\s+/g, " ");
  const after = text.slice(end, to).replace(/\s+/g, " ");
  return `${from > 0 ? "…" : ""}${before}「${shown}」${after}${to < text.length ? "…" : ""}`;
}

/**
 * 扫描一组出站字段。`secretLiterals` 由服务端传入当前部署的真实密钥值,
 * 精确匹配泄露的真值;浏览器端不传。
 */
export function scanOutboundText(
  fields: GuardField[],
  options: { secretLiterals?: readonly string[] } = {},
): GuardResult {
  const findings: GuardFinding[] = [];
  const seen = new Set<string>();
  const push = (finding: GuardFinding, start: number) => {
    const key = `${finding.field}:${finding.category}:${start}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(finding);
  };

  for (const field of fields) {
    const text = field.text;
    if (!text) continue;

    for (const literal of options.secretLiterals ?? []) {
      if (literal.length < 8) continue;
      let index = text.indexOf(literal);
      while (index !== -1) {
        push(
          {
            category: "env-value",
            severity: "block",
            hint: "与当前部署的真实密钥值一致",
            field: field.field,
            fieldLabel: field.label,
            excerpt: excerptOf(text, index, index + literal.length, false),
          },
          index,
        );
        index = text.indexOf(literal, index + literal.length);
      }
    }

    // 同一位置先命中的规则优先,避免 sk- 与键值规则重复报告同一个密钥
    const claimed: Array<[number, number]> = [];
    for (const rule of RULES) {
      for (const match of text.matchAll(rule.pattern)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (end === start) continue;
        if (claimed.some(([from, to]) => start < to && end > from)) continue;
        claimed.push([start, end]);
        push(
          {
            category: rule.category,
            severity: rule.severity,
            hint: rule.hint,
            field: field.field,
            fieldLabel: field.label,
            excerpt: excerptOf(text, start, end, rule.reveal ?? false),
          },
          start,
        );
      }
    }
  }

  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "block" ? -1 : 1));
  return { findings, blocked: findings.some((finding) => finding.severity === "block") };
}

type StructuredLike = Record<string, unknown> | null | undefined;

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * 把一份草稿展开为所有会被读者看到的字段:标题、正文、标签,
 * 小红书的分页与封面文案,抖音的钩子、口播与字幕。
 */
export function outboundFieldsOf(input: {
  contentKind: "xhs_graphic" | "douyin_video_script";
  title: string;
  body: string;
  structured: StructuredLike;
  tags?: string[];
}): GuardField[] {
  const structured = input.structured ?? {};
  const fields: GuardField[] = [
    { field: "title", label: "标题", text: input.title },
    { field: "body", label: input.contentKind === "douyin_video_script" ? "发布文案" : "正文", text: input.body },
  ];
  const tags = strings(structured.tags).length > 0 ? strings(structured.tags) : input.tags ?? [];
  if (tags.length > 0) fields.push({ field: "tags", label: "话题标签", text: tags.join(" ") });

  if (input.contentKind === "xhs_graphic") {
    records(structured.pages).forEach((page, index) => {
      fields.push({ field: `pages.${index}.heading`, label: `第 ${index + 1} 页标题`, text: str(page.heading) });
      fields.push({ field: `pages.${index}.body`, label: `第 ${index + 1} 页正文`, text: str(page.body) });
    });
    strings(structured.coverTextOptions).forEach((text, index) =>
      fields.push({ field: `coverTextOptions.${index}`, label: `封面文案 ${index + 1}`, text }),
    );
    fields.push({ field: "interactionEnding", label: "互动结尾", text: str(structured.interactionEnding) });
  } else {
    fields.push({ field: "hook", label: "开场钩子", text: str(structured.hook) });
    records(structured.shots).forEach((shot, index) => {
      fields.push({ field: `shots.${index}.voiceover`, label: `第 ${index + 1} 镜口播`, text: str(shot.voiceover) });
      fields.push({ field: `shots.${index}.subtitle`, label: `第 ${index + 1} 镜字幕`, text: str(shot.subtitle) });
    });
  }
  return fields.filter((field) => field.text.trim() !== "");
}
