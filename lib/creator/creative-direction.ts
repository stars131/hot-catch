import { z } from "zod";

export const DIRECTION_MANIFEST_PROTOCOL = "direction-manifest/v1" as const;

export function buildDirectionRouterSystem(locale: "zh-CN" | "en-US") {
  const languageRule = locale === "en-US"
    ? "Write every user-facing string in English."
    : "所有面向用户的字符串使用简体中文。";
  const role = locale === "en-US"
    ? "You are a content direction router."
    : "你是内容创作方向路由器。";
  return `${role}
${languageRule}
Only return one JSON object. Do not use Markdown or add fields. Use this exact contract:
{
  "intentSummary": "1-3 sentence diagnosis",
  "needsInput": false,
  "missingInputs": [],
  "recommendations": [
    {
      "key": "one key from availableDirections",
      "confidence": 0.82,
      "rationale": "why it fits this brief, persona and platform",
      "fitSignals": ["specific signal"],
      "risks": ["specific risk or boundary"],
      "outlinePreview": ["section 1", "section 2", "section 3"],
      "suggestedSecondaryKey": null
    }
  ],
  "novelCandidate": null
}
Rules:
1. If the brief is actionable, return exactly 3 distinct recommendations ordered best first. Every key must occur in availableDirections.
2. confidence is a JSON number from 0 to 1. fitSignals has 1-6 strings, risks has 0-5 strings, and outlinePreview has 2-6 strings.
3. suggestedSecondaryKey is null or another supplied direction key. It must never equal the recommendation key.
4. Diagnose genuinely blocking information only. When needsInput is true, missingInputs has at most 3 objects with key, label, reason, required, inputType. inputType is text or choice; include options only for choice. Otherwise needsInput is false and missingInputs is [].
5. Prefer one primary structure and at most one secondary mode. Do not invent user experiences, facts, data, trends or credentials.
6. For a blocking text input, use exactly: {"key":"topic","label":"...","reason":"...","required":true,"inputType":"text"}. For a choice input, add "options":["...","..."].
7. novelCandidate must normally be null. Only when no supplied direction can express the brief may it use exactly: {"label":"...","summary":"...","primaryInstruction":"...","secondaryInstruction":"...","outline":["...","..."],"evidencePolicy":"...","reviewCriteria":[{"label":"...","description":"..."},{"label":"...","description":"..."}]}.`;
}

export const CREATIVE_DIRECTION_IDS = [
  "experience",
  "growth-retrospective",
  "failure-lessons",
  "case-story",
  "process-log",
  "behind-scenes",
  "before-after",
  "interview",
  "step-by-step",
  "checklist",
  "pitfall-guide",
  "beginner-guide",
  "template",
  "faq",
  "troubleshooting",
  "resource-list",
  "demonstration",
  "contrarian",
  "myth-busting",
  "principle-explainer",
  "concept-breakdown",
  "commentary",
  "debate",
  "trend-analysis",
  "forecast",
  "data-analysis",
  "comparison-review",
  "experiment",
  "research-digest",
  "case-teardown",
  "cost-benefit",
  "decision-matrix",
  "ranking",
  "hotspot-analysis",
  "problem-solution",
  "scenario-simulation",
  "challenge",
  "community-cocreation",
  "series",
  "suspense-story",
] as const;

export type CreativeDirectionId = (typeof CREATIVE_DIRECTION_IDS)[number];
export type DirectionCategory =
  | "narrative"
  | "utility"
  | "explanation"
  | "evidence"
  | "engagement";

const directionRoleSchema = z.enum(["primary", "secondary", "both"]);
const platformSchema = z.enum([
  "xiaohongshu",
  "douyin",
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "reddit",
]);

export const directionManifestSchema = z
  .object({
    protocol: z.literal(DIRECTION_MANIFEST_PROTOCOL),
    key: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
    version: z.number().int().positive(),
    category: z.enum(["narrative", "utility", "explanation", "evidence", "engagement"]),
    labels: z.object({ zhCN: z.string().min(1).max(80), enUS: z.string().min(1).max(80) }).strict(),
    summary: z.object({ zhCN: z.string().min(1).max(300), enUS: z.string().min(1).max(300) }).strict(),
    aliases: z.array(z.string().min(1).max(80)).max(20),
    compatibility: z.object({
      platforms: z.array(platformSchema).min(1).max(7),
      goals: z.array(z.string().min(1).max(60)).min(1).max(12),
      role: directionRoleSchema,
    }).strict(),
    routing: z.object({
      signals: z.array(z.string().min(1).max(60)).min(2).max(16),
      negativeSignals: z.array(z.string().min(1).max(60)).max(12),
    }).strict(),
    generation: z.object({
      primaryInstruction: z.string().min(20).max(1600),
      secondaryInstruction: z.string().min(10).max(800),
      outline: z.array(z.string().min(1).max(100)).min(2).max(12),
    }).strict(),
    evidence: z.object({
      policy: z.string().min(10).max(1000),
      requiresUserEvidence: z.boolean(),
    }).strict(),
    review: z.object({
      criteria: z.array(z.object({
        key: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
        label: z.string().min(1).max(80),
        description: z.string().min(10).max(500),
        weight: z.number().int().min(1).max(100),
        severity: z.enum(["advisory", "important"]),
      }).strict()).min(2).max(8),
      passThreshold: z.number().int().min(50).max(100),
    }).strict(),
    conflicts: z.array(z.string().regex(/^[a-z][a-z0-9-]{1,63}$/)).max(12),
  })
  .strict();

export type DirectionManifest = z.infer<typeof directionManifestSchema>;

export const directionRefSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
  version: z.number().int().positive(),
  source: z.enum(["catalog", "temporary"]),
  candidateId: z.string().cuid().optional(),
}).strict();

export type DirectionRef = z.infer<typeof directionRefSchema>;

export const directionSelectionSchema = z.object({
  decisionId: z.string().cuid().optional(),
  primary: directionRefSchema,
  secondary: directionRefSchema.optional(),
}).strict();

export type DirectionSelection = z.infer<typeof directionSelectionSchema>;

export const directionSnapshotSchema = z.object({
  decisionId: z.string().cuid().optional(),
  primary: directionManifestSchema,
  secondary: directionManifestSchema.optional(),
  recommendation: z.object({
    confidence: z.number().min(0).max(1).optional(),
    rationale: z.string().max(1000),
    risks: z.array(z.string().max(300)).max(8),
  }).strict().optional(),
  capturedAt: z.string().datetime(),
}).strict();

export type DirectionSnapshot = z.infer<typeof directionSnapshotSchema>;

const ALL_PLATFORMS = [
  "xiaohongshu",
  "douyin",
  "youtube",
  "tiktok",
  "instagram",
  "x",
  "reddit",
] as const;

type SeedInput = {
  key: CreativeDirectionId;
  category: DirectionCategory;
  zh: string;
  en: string;
  summary: string;
  structure: string;
  evidence: string;
  review: string;
  signals: string[];
  aliases?: string[];
  requiresEvidence?: boolean;
  conflicts?: CreativeDirectionId[];
};

function seed(input: SeedInput): DirectionManifest {
  return directionManifestSchema.parse({
    protocol: DIRECTION_MANIFEST_PROTOCOL,
    key: input.key,
    version: 1,
    category: input.category,
    labels: { zhCN: input.zh, enUS: input.en },
    summary: { zhCN: input.summary, enUS: input.summary },
    aliases: input.aliases ?? [],
    compatibility: {
      platforms: [...ALL_PLATFORMS],
      goals: ["认知", "信任", "收藏", "互动", "转化"],
      role: "both",
    },
    routing: { signals: input.signals, negativeSignals: [] },
    generation: {
      primaryInstruction: `${input.structure} 所有事实、数据和经历必须来自用户资料或明确标注为待核验，不得补写成真实事实。`,
      secondaryInstruction: `保留主方向的内容骨架，同时用“${input.zh}”的表达特征增强切入、例证或收束，不得覆盖主方向结构。`,
      outline: input.structure.split("；").map((item) => item.trim()).filter(Boolean).slice(0, 8),
    },
    evidence: { policy: input.evidence, requiresUserEvidence: input.requiresEvidence ?? false },
    review: {
      criteria: [
        { key: "structure-fit", label: "结构匹配", description: input.review, weight: 45, severity: "important" },
        { key: "evidence-fit", label: "证据与边界", description: input.evidence, weight: 35, severity: "important" },
        { key: "reader-value", label: "读者价值", description: `内容应让目标读者清楚理解${input.summary}，并获得可复述或可执行的收获。`, weight: 20, severity: "advisory" },
      ],
      passThreshold: 72,
    },
    conflicts: input.conflicts ?? [],
  });
}

export const BUILTIN_DIRECTION_MANIFESTS: DirectionManifest[] = [
  seed({ key: "experience", category: "narrative", zh: "经验分享", en: "Experience-led", summary: "用真实经历提炼可复用的方法", structure: "交代真实场景与起点；呈现关键转折；总结可复用方法与适用边界", evidence: "必须区分亲历、观察和推测；没有用户证据时不得使用第一人称亲历口吻。", review: "应存在清晰的经历线索、转折和方法提炼，不能退化为泛泛教程。", signals: ["经历", "复盘", "亲测", "我是如何"], aliases: ["direction-experience", "经验分享", "experience-led"], requiresEvidence: true }),
  seed({ key: "growth-retrospective", category: "narrative", zh: "成长复盘", en: "Growth retrospective", summary: "呈现阶段变化并解释成长机制", structure: "说明原始状态；列出关键事件与选择；分析变化原因；给出下一阶段行动", evidence: "时间、结果和变化必须可追溯，不能把相关性写成因果。", review: "应同时包含前后状态、关键决策和因果边界。", signals: ["成长", "变化", "复盘", "一年后"] }),
  seed({ key: "failure-lessons", category: "narrative", zh: "失败教训", en: "Failure lessons", summary: "从失败过程提炼可避免的错误", structure: "说明目标与失败结果；拆解错误决策；识别早期信号；给出避免方案", evidence: "失败原因只能基于已有事实，未知原因必须标记为推测。", review: "应写清失败结果、错误链条和可操作的预防措施。", signals: ["失败", "踩坑", "教训", "做错"] }),
  seed({ key: "case-story", category: "narrative", zh: "案例故事", en: "Case story", summary: "用完整案例承载观点或方法", structure: "建立人物与目标；呈现冲突；描述行动；展示结果；提炼启示", evidence: "案例必须可核验或明确匿名化，不能拼接虚构细节冒充真实案例。", review: "案例应有目标、冲突、行动、结果和启示五个环节。", signals: ["案例", "客户", "故事", "项目"] }),
  seed({ key: "process-log", category: "narrative", zh: "过程记录", en: "Process log", summary: "按时间展示任务推进与决策", structure: "定义任务；按阶段记录行动与产物；标记决策点；总结当前状态", evidence: "时间线、产物和状态必须与已有记录一致。", review: "应有可追踪的阶段、动作、决策和产物，不能只罗列感受。", signals: ["过程", "记录", "第几天", "进度"] }),
  seed({ key: "behind-scenes", category: "narrative", zh: "幕后揭秘", en: "Behind the scenes", summary: "展示成品背后的流程和取舍", structure: "先展示成品或结果；揭示准备过程；说明关键取舍；补充未采用方案", evidence: "不得泄露隐私、凭证、商业机密或未经授权的内部资料。", review: "应呈现外部看不到的流程与真实取舍，而不是重复成品介绍。", signals: ["幕后", "背后", "花絮", "制作过程"] }),
  seed({ key: "before-after", category: "narrative", zh: "前后对比", en: "Before and after", summary: "通过同一对象的变化证明方法价值", structure: "建立可比的前后基线；说明干预动作；展示变化；解释其他影响因素", evidence: "前后指标必须口径一致，并说明样本、周期和非方法因素。", review: "应有同口径基线、变化、干预动作和因果限制。", signals: ["前后", "改造", "对比", "变化"] }),
  seed({ key: "interview", category: "narrative", zh: "人物访谈", en: "Interview", summary: "通过问答呈现人物经验和观点", structure: "介绍受访者与背景；围绕核心问题递进提问；保留有信息量的回答；总结分歧与启示", evidence: "不得伪造引语、身份或采访过程；转述必须明确标记。", review: "问题应递进，回答应保留人物视角和可核验信息。", signals: ["访谈", "对话", "采访", "问答"], requiresEvidence: true }),
  seed({ key: "step-by-step", category: "utility", zh: "步骤教程", en: "Step-by-step", summary: "按执行顺序教会读者完成任务", structure: "说明目标与前置条件；按顺序给出动作；标记每步结果；补充验收方式", evidence: "命令、入口和参数必须来自当前可用产品或资料，未知项需标记。", review: "至少包含三个有顺序的动作，并说明输入、结果或验收标准。", signals: ["教程", "步骤", "怎么做", "操作"] }),
  seed({ key: "checklist", category: "utility", zh: "检查清单", en: "Checklist", summary: "把复杂任务压缩成可逐项核对的清单", structure: "定义使用场景；按阶段分组清单；每项使用可验证动作；给出完成标准", evidence: "清单项应可观察或可验证，避免只有抽象原则。", review: "清单必须分组、可勾选并包含明确完成标准。", signals: ["清单", "检查", "核对", "准备"], aliases: ["direction-checklist", "步骤清单", "step-by-step"] }),
  seed({ key: "pitfall-guide", category: "utility", zh: "避坑指南", en: "Pitfall guide", summary: "识别常见错误并给出预防动作", structure: "列出高频风险；解释触发条件；展示后果；给出预防与补救", evidence: "风险概率和后果不能夸大，个案不得包装成普遍规律。", review: "每个坑都应包含触发条件、后果和预防动作。", signals: ["避坑", "错误", "不要", "注意"] }),
  seed({ key: "beginner-guide", category: "utility", zh: "新手入门", en: "Beginner guide", summary: "用最低认知门槛建立完整入门路径", structure: "解释基础概念；给出最小准备；完成第一个结果；指向下一阶段", evidence: "术语和操作必须准确，不默认读者拥有未说明的知识。", review: "应控制术语密度，并让新手能完成一个最小闭环。", signals: ["新手", "入门", "零基础", "第一次"] }),
  seed({ key: "template", category: "utility", zh: "模板套用", en: "Template", summary: "提供可直接替换变量的结构模板", structure: "说明模板用途；给出完整模板；解释变量；展示一份填充示例", evidence: "示例数据必须标记为示例，不能冒充真实结果。", review: "模板应可复制、变量清楚，并包含至少一个填充示例。", signals: ["模板", "话术", "提示词", "框架"] }),
  seed({ key: "faq", category: "utility", zh: "FAQ 问答", en: "FAQ", summary: "围绕真实疑问提供短而明确的答案", structure: "按读者决策路径排序问题；直接回答；补充条件与例外；提供下一步", evidence: "问题应来自用户资料或合理场景，答案不确定时必须说明。", review: "每个问题都应直接回答，并包含必要条件或例外。", signals: ["问答", "FAQ", "常见问题", "为什么"] }),
  seed({ key: "troubleshooting", category: "utility", zh: "故障排查", en: "Troubleshooting", summary: "从症状逐步定位原因并恢复", structure: "定义症状；先做低风险检查；按分支定位原因；给出恢复和升级条件", evidence: "不能建议破坏性操作或未经确认的凭证处理。", review: "排查顺序应由低风险到高风险，并有分支判断与停止条件。", signals: ["报错", "失败", "排查", "修复"] }),
  seed({ key: "resource-list", category: "utility", zh: "工具资源清单", en: "Resource list", summary: "按任务场景整理可选工具和资料", structure: "定义选择标准；按场景分组；说明每项用途与限制；给出选择建议", evidence: "产品能力、价格和链接等时效信息必须核验或标注日期。", review: "资源应按场景组织，并说明适用条件和限制。", signals: ["工具", "资源", "合集", "推荐"] }),
  seed({ key: "demonstration", category: "utility", zh: "操作演示", en: "Demonstration", summary: "通过连续操作展示实际效果", structure: "说明演示目标；展示输入；逐步执行；呈现输出；解释异常情况", evidence: "演示结果必须来自真实运行或明确标注为预期示例。", review: "应同时展示输入、动作和输出，关键步骤不能跳过。", signals: ["演示", "实操", "现场", "效果"] }),
  seed({ key: "contrarian", category: "explanation", zh: "反常识观点", en: "Contrarian angle", summary: "用可辩护的新判断挑战常见认知", structure: "陈述常见认知；提出克制的新判断；给出证据与推理；说明边界和反例", evidence: "冲突性结论必须有证据，不得用夸张标题替代论证。", review: "应包含明确反差、完整理由、适用边界和至少一个反例。", signals: ["反常识", "其实", "不是而是", "别再"], aliases: ["direction-contrarian", "反常识观点", "contrarian angle"] }),
  seed({ key: "myth-busting", category: "explanation", zh: "误区澄清", en: "Myth busting", summary: "拆解错误认知并给出更准确解释", structure: "复述误区；解释其来源；给出事实或机制；提供正确判断方法", evidence: "必须区分事实错误、条件差异和观点分歧。", review: "应准确复述误区，并用证据或机制完成纠正。", signals: ["误区", "谣言", "真相", "澄清"] }),
  seed({ key: "principle-explainer", category: "explanation", zh: "原理解释", en: "Principle explainer", summary: "解释现象背后的机制和因果链", structure: "提出具体现象；定义关键变量；解释作用机制；给出可观察预测与边界", evidence: "机制推断不得冒充已证实因果，引用结论需保留条件。", review: "应形成变量、机制、结果之间的清晰链路。", signals: ["原理", "机制", "为什么", "底层逻辑"] }),
  seed({ key: "concept-breakdown", category: "explanation", zh: "概念拆解", en: "Concept breakdown", summary: "把抽象概念拆成可理解的组成部分", structure: "给出简明定义；拆分组成部分；用例子说明；对比相近概念；总结使用场景", evidence: "定义应基于可靠资料，不得自造行业共识。", review: "应包含定义、组成、例子和相近概念区分。", signals: ["概念", "是什么", "拆解", "区别"] }),
  seed({ key: "commentary", category: "explanation", zh: "观点评论", en: "Commentary", summary: "对事件或现象提出有依据的立场", structure: "交代评论对象；明确立场；给出论据；回应反方；提出影响或行动", evidence: "事实部分和个人判断必须明确分开。", review: "立场应明确，论据应支持结论，并回应主要反方意见。", signals: ["观点", "评论", "怎么看", "我认为"] }),
  seed({ key: "debate", category: "explanation", zh: "正反辩论", en: "Debate", summary: "公平呈现冲突观点并给出判断条件", structure: "定义争议问题；呈现正方依据；呈现反方依据；比较前提；给出条件化结论", evidence: "不得歪曲反方观点，双方证据标准应一致。", review: "双方应被公平呈现，最终结论必须说明适用条件。", signals: ["正反", "争议", "辩论", "该不该"] }),
  seed({ key: "trend-analysis", category: "explanation", zh: "趋势判断", en: "Trend analysis", summary: "从多个信号判断趋势阶段和影响", structure: "定义观察窗口；列出领先与滞后信号；解释驱动因素；给出情景与跟踪指标", evidence: "趋势判断必须标记数据时间和不确定性。", review: "应有时间窗口、多类信号、驱动因素和后续验证指标。", signals: ["趋势", "正在发生", "未来", "变化"] }),
  seed({ key: "forecast", category: "explanation", zh: "预测展望", en: "Forecast", summary: "以条件化情景推演未来可能性", structure: "建立当前基线；列出关键变量；构建多个情景；给出触发信号与失效条件", evidence: "预测不得写成确定事实，必须展示假设和置信边界。", review: "至少包含基线、变量、两个情景和失效条件。", signals: ["预测", "展望", "接下来", "可能"] }),
  seed({ key: "data-analysis", category: "evidence", zh: "数据解读", en: "Data analysis", summary: "把数据变化转化为有边界的结论", structure: "说明数据来源与口径；展示关键变化；比较基线；解释可能原因；给出限制", evidence: "必须标明来源、时间、样本和指标口径，不能虚构数据。", review: "数据来源、口径、比较基线和限制必须完整。", signals: ["数据", "指标", "增长", "统计"], requiresEvidence: true }),
  seed({ key: "comparison-review", category: "evidence", zh: "对比测评", en: "Comparison review", summary: "按同一标准比较多个选项", structure: "定义用户场景；建立评价维度；逐项比较；说明权衡；按人群给出结论", evidence: "测评体验、参数和价格必须可核验，并披露合作或样本限制。", review: "比较对象必须使用同一维度，结论应按用户场景区分。", signals: ["测评", "对比", "哪个好", "横评"] }),
  seed({ key: "experiment", category: "evidence", zh: "实验验证", en: "Experiment", summary: "用可复现实验检验一个假设", structure: "提出假设；定义变量与控制；说明步骤；展示结果；分析误差与复现条件", evidence: "实验过程和结果必须真实，不得补写不存在的样本。", review: "应包含假设、变量、控制、结果和误差分析。", signals: ["实验", "测试", "验证", "A/B"], requiresEvidence: true }),
  seed({ key: "research-digest", category: "evidence", zh: "研究摘要", en: "Research digest", summary: "提炼研究结论、方法和适用边界", structure: "说明研究问题；概述方法与样本；提炼主要发现；解释限制；给出实践含义", evidence: "必须基于提供的论文或可靠来源，不得补写研究结论。", review: "应同时覆盖研究问题、方法、发现、限制和实践含义。", signals: ["研究", "论文", "报告", "摘要"], requiresEvidence: true }),
  seed({ key: "case-teardown", category: "evidence", zh: "案例拆解", en: "Case teardown", summary: "从成品反推策略、结构和可复用机制", structure: "明确拆解对象；分层识别策略与执行；引用具体证据；总结可迁移与不可迁移部分", evidence: "分析必须指向可见证据，不能把推测写成创作者真实意图。", review: "每个判断应有案例证据，并区分事实、推断和迁移条件。", signals: ["拆解", "复盘案例", "分析账号", "为什么火"] }),
  seed({ key: "cost-benefit", category: "evidence", zh: "成本收益", en: "Cost benefit", summary: "比较方案投入、回报和风险", structure: "定义目标与周期；列出直接和隐性成本；估算收益；分析风险；给出阈值判断", evidence: "金额、时间和回报率必须注明假设，不能承诺收益。", review: "成本与收益口径应对应，并包含风险和盈亏阈值。", signals: ["成本", "收益", "值不值", "ROI"] }),
  seed({ key: "decision-matrix", category: "evidence", zh: "决策矩阵", en: "Decision matrix", summary: "用加权条件帮助用户做选择", structure: "定义备选项；确定评价维度与权重；逐项评分；做敏感性检查；给出条件化建议", evidence: "权重和评分依据必须透明，主观评分要明确标注。", review: "备选项、维度、权重、评分依据和敏感性必须可见。", signals: ["选择", "决策", "矩阵", "怎么选"] }),
  seed({ key: "ranking", category: "evidence", zh: "排名盘点", en: "Ranking", summary: "按公开标准排序并解释差异", structure: "说明入选范围；公开排序标准；逐项给出依据；解释并列和例外；按场景补充选择", evidence: "排名标准必须一致，商业关系和主观权重需披露。", review: "排序范围、标准和每项依据应完整且一致。", signals: ["排名", "Top", "盘点", "榜单"] }),
  seed({ key: "hotspot-analysis", category: "engagement", zh: "热点解读", en: "Hot topic analysis", summary: "快速解释事件、影响和可行动信息", structure: "交代已确认事实；整理时间线；解释相关方与影响；区分未知信息；给出后续观察点", evidence: "热点事实必须标明来源与时间，传闻不得包装为结论。", review: "事实、时间线、影响、未知项和观察点应被清楚区分。", signals: ["热点", "新闻", "刚刚", "事件"], requiresEvidence: true }),
  seed({ key: "problem-solution", category: "engagement", zh: "问题解决", en: "Problem solution", summary: "从具体痛点给出可执行解决方案", structure: "描述可识别的问题；分析根因；提出方案；说明执行步骤；给出验证指标", evidence: "不能把单一方案描述为对所有人有效。", review: "问题、根因、方案、执行和验证必须形成闭环。", signals: ["问题", "痛点", "解决", "怎么办"] }),
  seed({ key: "scenario-simulation", category: "engagement", zh: "场景模拟", en: "Scenario simulation", summary: "在具体情境中演示判断和行动", structure: "设定角色与约束；触发事件；展示选择；比较结果；总结判断规则", evidence: "模拟内容必须标记为情境示例，不能冒充真实事件。", review: "角色、约束、选择、结果和规则应构成完整情境。", signals: ["场景", "假设", "模拟", "如果"] }),
  seed({ key: "challenge", category: "engagement", zh: "挑战打卡", en: "Challenge", summary: "用阶段任务推动读者参与和反馈", structure: "定义挑战目标与周期；拆分每日或阶段任务；给出打卡标准；设置复盘与退出条件", evidence: "效果不能保证，健康或财务类挑战必须补充风险边界。", review: "应有周期、阶段任务、完成标准和复盘机制。", signals: ["挑战", "打卡", "连续", "一起做"] }),
  seed({ key: "community-cocreation", category: "engagement", zh: "社区共创", en: "Community co-creation", summary: "邀请受众贡献案例、选择或反馈", structure: "提出明确共创问题；提供参与格式；展示如何使用反馈；设置结果回传方式", evidence: "不得诱导提交隐私、凭证或未经授权的内容。", review: "参与门槛应低，输入格式和反馈去向必须明确。", signals: ["共创", "征集", "评论区", "一起"] }),
  seed({ key: "series", category: "engagement", zh: "系列连载", en: "Series", summary: "把复杂主题拆成连续且独立成篇的内容", structure: "定义系列总问题；说明本篇位置；完成一个独立子问题；留下下一篇承接点", evidence: "每篇必须独立提供价值，不得用虚假悬念替代内容。", review: "本篇应可独立理解，同时清楚连接系列主线和下一篇。", signals: ["系列", "连载", "第几期", "专题"] }),
  seed({ key: "suspense-story", category: "engagement", zh: "故事悬念", en: "Suspense story", summary: "通过信息节奏维持注意力并完成价值交付", structure: "提出真实冲突；分阶段释放线索；在转折处更新判断；明确揭示结果；回收主题", evidence: "不得隐瞒关键事实制造误导，也不得虚构冲突。", review: "悬念必须服务于真实冲突，结尾应揭示结果并回收主题。", signals: ["悬念", "反转", "没想到", "故事"] }),
];

const BUILTIN_BY_KEY = new Map(BUILTIN_DIRECTION_MANIFESTS.map((manifest) => [manifest.key, manifest]));
const ALIAS_TO_KEY = new Map<string, CreativeDirectionId>();
for (const manifest of BUILTIN_DIRECTION_MANIFESTS) {
  for (const alias of [manifest.key, manifest.labels.zhCN, manifest.labels.enUS, ...manifest.aliases]) {
    ALIAS_TO_KEY.set(alias.trim().toLowerCase(), manifest.key as CreativeDirectionId);
  }
}

export function builtinDirection(key: string): DirectionManifest | null {
  return BUILTIN_BY_KEY.get(key) ?? null;
}

export function normalizeCreativeDirection(value: unknown): CreativeDirectionId | null {
  if (typeof value !== "string") return null;
  return ALIAS_TO_KEY.get(value.trim().toLowerCase()) ?? null;
}

export function creativeDirectionLabel(direction: string, locale: "zh-CN" | "en-US" = "zh-CN"): string {
  const definition = BUILTIN_BY_KEY.get(direction);
  if (!definition) return direction;
  return locale === "en-US" ? definition.labels.enUS : definition.labels.zhCN;
}

export function creativeDirectionInstruction(direction: string, locale: "zh-CN" | "en-US" = "zh-CN"): string {
  const definition = BUILTIN_BY_KEY.get(direction);
  if (!definition) return "";
  if (locale === "en-US") {
    return `${definition.summary.enUS}. ${definition.generation.primaryInstruction}`;
  }
  return definition.generation.primaryInstruction;
}

export function resolveCreativeDirection(contextSnapshot: unknown, inputText?: string | null): CreativeDirectionId | null {
  const snapshot = asRecord(contextSnapshot);
  const selection = asRecord(snapshot.directionSelection ?? snapshot.creativeDirection);
  const primary = asRecord(selection.primary);
  const direct = normalizeCreativeDirection(primary.key ?? snapshot.creativeDirection);
  if (direct) return direct;
  const match = inputText?.match(/(?:表达方向|Direction)\s*[：:]\s*([^\n]+)/i)?.[1];
  return normalizeCreativeDirection(match);
}

export type CreativeDirectionReview = {
  id: string;
  label: string;
  passed: boolean;
  checks: Array<{ key: string; label: string; passed: boolean; reason: string }>;
};

export function reviewCreativeDirection(input: {
  direction: string;
  title?: string | null;
  bodyText?: string | null;
  structuredContent?: unknown;
}): CreativeDirectionReview {
  const manifest = BUILTIN_BY_KEY.get(input.direction);
  const text = [input.title, input.bodyText, JSON.stringify(input.structuredContent ?? {})]
    .filter(Boolean)
    .join("\n");
  const enoughContent = text.trim().length >= 120;
  const hasStructure = /\n|[。！？.!?]|第[一二三四五六七八九十\d]+|\d+[.、]/.test(text);
  const checks = manifest
    ? manifest.review.criteria.map((criterion, index) => ({
        key: criterion.key,
        label: criterion.label,
        passed: index === 0 ? hasStructure : enoughContent,
        reason: index === 0 ? criterion.description : `${criterion.description}${enoughContent ? "" : " 当前内容信息量不足。"}`,
      }))
    : [{ key: "direction", label: "方向信息", passed: false, reason: "未找到可用的方向定义。" }];
  return {
    id: input.direction,
    label: creativeDirectionLabel(input.direction),
    passed: checks.every((item) => item.passed),
    checks,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
