export type ScoredContentKind = "xhs_graphic" | "douyin_video_script";

export type ScoreDimension = {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  reasons: string[];
};

export type ContentScore = {
  total: number;
  maxScore: 100;
  dimensions: ScoreDimension[];
  warnings: string[];
};

type ScoreInput = {
  kind: ScoredContentKind;
  title?: string | null;
  bodyText?: string | null;
  structuredContent?: unknown;
  riskNotes?: string | null;
};

export const DEFAULT_RUBRIC_RULES = {
  xhs_graphic: {
    hook: 20,
    value: 25,
    structure: 20,
    visual: 15,
    interaction: 10,
    safety: 10,
  },
  douyin_video_script: {
    hook: 20,
    value: 20,
    timeline: 20,
    visual: 15,
    audio: 10,
    safety: 15,
  },
} as const;

export function scoreContent(input: ScoreInput): ContentScore {
  return input.kind === "xhs_graphic" ? scoreXhs(input) : scoreDouyin(input);
}

function scoreXhs(input: ScoreInput): ContentScore {
  const data = asRecord(input.structuredContent);
  const title = stringValue(data.title) || input.title || "";
  const titleOptions = arrayValue(data.titleOptions);
  const coverOptions = arrayValue(data.coverTextOptions);
  const pages = arrayValue(data.pages);
  const body = stringValue(data.bodyText) || input.bodyText || "";
  const tags = arrayValue(data.tags);
  const interaction = stringValue(data.interactionEnding);
  const risks = arrayValue(data.riskNotes);

  const dimensions: ScoreDimension[] = [
    dimension("hook", "标题与开场", 20, [
      [title.length >= 8 && title.length <= 30, 8, "主标题长度建议为 8–30 字"],
      [titleOptions.length >= 3, 6, "至少提供 3 个标题候选"],
      [coverOptions.length >= 2, 6, "至少提供 2 个封面文案"],
    ]),
    dimension("value", "信息价值", 25, [
      [body.length >= 300, 12, "正文建议至少 300 字"],
      [pages.length >= 4, 8, "建议至少拆成 4 页"],
      [pages.every((page) => stringValue(asRecord(page).body).length >= 10), 5, "每页需要有可执行内容"],
    ]),
    dimension("structure", "结构完整", 20, [
      [pages.length >= 3, 8, "至少包含 3 页结构"],
      [pages.every((page, index) => numberValue(asRecord(page).pageNumber) === index + 1), 6, "页码应连续"],
      [pages.every((page) => Boolean(stringValue(asRecord(page).heading))), 6, "每页都需要标题"],
    ]),
    dimension("visual", "视觉指令", 15, [
      [pages.every((page) => Boolean(stringValue(asRecord(page).visualSuggestion))), 10, "每页需要视觉建议"],
      [coverOptions.length >= 2, 5, "封面需要备选方案"],
    ]),
    dimension("interaction", "互动与分发", 10, [
      [interaction.length >= 5, 5, "需要自然的互动收尾"],
      [tags.length >= 3, 5, "至少提供 3 个相关标签"],
    ]),
    dimension("safety", "风险控制", 10, [
      [risks.length > 0 || Boolean(input.riskNotes), 6, "需要明确风险检查结论"],
      [!/(绝对|保证|百分之百|最[好强])/.test(body), 4, "避免绝对化表达"],
    ]),
  ];
  return finalize(dimensions);
}

function scoreDouyin(input: ScoreInput): ContentScore {
  const data = asRecord(input.structuredContent);
  const shots = arrayValue(data.shots);
  const firstShot = asRecord(shots[0]);
  const duration = numberValue(data.durationSec);
  const risks = arrayValue(data.riskNotes);
  const timelineContinuous = shots.every((shot, index) => {
    const current = asRecord(shot);
    if (numberValue(current.endSec) <= numberValue(current.startSec)) return false;
    if (index === 0) return numberValue(current.startSec) === 0;
    const previous = asRecord(shots[index - 1]);
    return Math.abs(numberValue(current.startSec) - numberValue(previous.endSec)) <= 0.2;
  });

  const dimensions: ScoreDimension[] = [
    dimension("hook", "前三秒开场", 20, [
      [numberValue(firstShot.startSec) === 0 && numberValue(firstShot.endSec) <= 3, 10, "第一镜应覆盖前三秒"],
      [stringValue(data.hook).length >= 3, 5, "需要明确开场钩子"],
      [Boolean(stringValue(firstShot.voiceover) && stringValue(firstShot.subtitle)), 5, "开场需同时有口播和字幕"],
    ]),
    dimension("value", "内容价值", 20, [
      [shots.length >= 3, 8, "建议至少 3 个分镜"],
      [stringValue(data.caption).length >= 20, 6, "发布文案需要完整"],
      [arrayValue(data.tags).length >= 3, 6, "至少提供 3 个标签"],
    ]),
    dimension("timeline", "时间轴", 20, [
      [timelineContinuous, 12, "时间轴需连续且不重叠"],
      [duration >= 10, 4, "总时长需至少 10 秒"],
      [Math.abs(numberValue(asRecord(shots.at(-1)).endSec) - duration) <= 1, 4, "尾镜应与总时长一致"],
    ]),
    dimension("visual", "画面与镜头", 15, [
      [shots.every((shot) => Boolean(stringValue(asRecord(shot).visual))), 7, "每镜都需画面指令"],
      [shots.every((shot) => Boolean(stringValue(asRecord(shot).camera))), 4, "每镜都需镜头指令"],
      [shots.every((shot) => Boolean(stringValue(asRecord(shot).transition))), 4, "每镜都需转场指令"],
    ]),
    dimension("audio", "口播与音乐", 10, [
      [shots.every((shot) => Boolean(stringValue(asRecord(shot).voiceover))), 5, "每镜都需口播"],
      [shots.every((shot) => Boolean(stringValue(asRecord(shot).music))), 5, "每镜都需音乐提示"],
    ]),
    dimension("safety", "风险控制", 15, [
      [risks.length > 0 || shots.some((shot) => Boolean(stringValue(asRecord(shot).risk))), 8, "需记录逐镜或全片风险"],
      [shots.every((shot) => !/(绝对|保证|百分之百)/.test(stringValue(asRecord(shot).voiceover))), 7, "口播避免绝对化表达"],
    ]),
  ];
  return finalize(dimensions);
}

function dimension(
  key: string,
  label: string,
  maxScore: number,
  checks: Array<[boolean, number, string]>,
): ScoreDimension {
  const score = checks.reduce((sum, [passed, points]) => sum + (passed ? points : 0), 0);
  return { key, label, score, maxScore, reasons: checks.filter(([passed]) => !passed).map(([, , reason]) => reason) };
}

function finalize(dimensions: ScoreDimension[]): ContentScore {
  return {
    total: dimensions.reduce((sum, dimensionValue) => sum + dimensionValue.score, 0),
    maxScore: 100,
    dimensions,
    warnings: dimensions.flatMap((dimensionValue) => dimensionValue.reasons),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
