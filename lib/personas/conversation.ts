export const PERSONA_DRAFT_KEYS = [
  "name",
  "accountName",
  "creatorIdentity",
  "niche",
  "targetAudience",
  "contentStyle",
  "sustainableTopics",
  "personalExperience",
  "commonPhrases",
  "expressionBoundary",
  "forbiddenTopics",
  "businessGoal",
  "accountGoal",
] as const;

export type PersonaDraftKey = (typeof PERSONA_DRAFT_KEYS)[number];
export type PersonaDraft = Record<PersonaDraftKey, string>;

export type PersonaConversationStep = {
  key: PersonaDraftKey;
  label: string;
  question: string;
  placeholder: string;
};

export const PERSONA_CONVERSATION_STEPS: PersonaConversationStep[] = [
  { key: "name", label: "版本名称", question: "先给这版人设起个名字，方便以后识别。", placeholder: "例如：专业增长顾问 v2" },
  { key: "accountName", label: "账号名称", question: "这个人设对应的账号叫什么？", placeholder: "例如：星际增长笔记" },
  { key: "creatorIdentity", label: "创作者身份", question: "希望账号以什么身份和经历出现在受众面前？", placeholder: "例如：有 8 年品牌经验的独立增长顾问" },
  { key: "niche", label: "内容定位", question: "这个账号最核心的内容定位是什么？", placeholder: "例如：帮助小团队低成本搭建内容增长系统" },
  { key: "targetAudience", label: "目标受众", question: "主要在和哪一类人说话？可以描述职业、阶段和痛点。", placeholder: "例如：刚开始做个人品牌的创业者和市场负责人" },
  { key: "contentStyle", label: "表达风格", question: "内容应该呈现怎样的语气、节奏和结构？", placeholder: "例如：直接、克制，先给结论，再给可执行步骤" },
  { key: "sustainableTopics", label: "持续选题", question: "哪些主题可以长期稳定地讲？", placeholder: "每行一个主题，或用顿号分隔" },
  { key: "personalExperience", label: "个人经历", question: "有哪些真实经历、案例或背景可以成为内容素材？", placeholder: "填写可公开使用的经历；敏感信息不要写入" },
  { key: "commonPhrases", label: "常用表达", question: "有哪些常用句式、口头禅或标志性表达需要保留？", placeholder: "例如：先把问题拆小；判断标准只有三个" },
  { key: "expressionBoundary", label: "表达边界", question: "表达时要遵守哪些原则和边界？", placeholder: "例如：不贩卖焦虑，不夸大结果，不攻击同行" },
  { key: "forbiddenTopics", label: "禁区", question: "有哪些绝对不要触碰的话题、承诺或措辞？", placeholder: "例如：未经验证的收益承诺、客户隐私" },
  { key: "businessGoal", label: "商业目标", question: "这个人设服务于什么商业目标？", placeholder: "例如：建立专业信任，为咨询服务获取有效线索" },
  { key: "accountGoal", label: "账号目标", question: "最后，未来 3 到 6 个月希望账号达到什么目标？", placeholder: "例如：稳定周更 3 次，形成 3 个系列栏目" },
];

export function createPersonaDraft(
  source?: Record<string, unknown> | null,
  accountName = "",
): PersonaDraft {
  return Object.fromEntries(
    PERSONA_DRAFT_KEYS.map((key) => [
      key,
      String(source?.[key] ?? (key === "accountName" ? accountName : "")),
    ]),
  ) as PersonaDraft;
}
