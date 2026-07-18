/**
 * 抖音分镜时间轴的即时校验。
 *
 * 规则与 lib/content/schemas.ts 中 douyinVideoScriptOutputSchema 的 superRefine 一致:
 * 首镜从 0 秒开始、每镜结束晚于开始、相邻镜头连续(误差 ≤0.2s)、
 * 尾镜与总时长一致(误差 ≤1s)。编辑器据此做逐镜与整体的实时提示,
 * 输入按 unknown 防御式读取,手动编辑到一半的脏数据不抛异常。
 */

export type StoryboardIssue = {
  /** 涉及的分镜下标(0 起);整体问题(总时长)时为 null */
  shotIndex: number | null;
  message: string;
};

export type StoryboardValidation = {
  issues: StoryboardIssue[];
  /** 尾镜结束时间;没有分镜时为 0 */
  timelineEnd: number;
  /** 声明的总时长(durationSec);缺失时为 null */
  declaredDuration: number | null;
};

/** 抵消 0.1 步进输入带来的浮点噪声(如 5-4.8 = 0.2000…02),不放宽业务容差 */
const FLOAT_EPSILON = 1e-9;

export function validateStoryboard(structured: unknown): StoryboardValidation {
  const record = asRecord(structured);
  const shots = Array.isArray(record?.shots) ? record.shots.map(asShot) : [];
  const declaredDuration =
    typeof record?.durationSec === "number" && Number.isFinite(record.durationSec)
      ? record.durationSec
      : null;

  const issues: StoryboardIssue[] = [];
  let previousEnd = 0;
  shots.forEach((shot, index) => {
    if (shot.endSec <= shot.startSec) {
      issues.push({
        shotIndex: index,
        message: `第 ${index + 1} 镜结束时间必须晚于开始时间。`,
      });
    }
    if (index === 0 && shot.startSec !== 0) {
      issues.push({ shotIndex: 0, message: "第一镜必须从 0 秒开始。" });
    }
    if (index > 0 && Math.abs(shot.startSec - previousEnd) > 0.2 + FLOAT_EPSILON) {
      issues.push({
        shotIndex: index,
        message: `第 ${index + 1} 镜与上一镜不连续(上一镜在 ${formatSeconds(previousEnd)} 结束)。`,
      });
    }
    previousEnd = shot.endSec;
  });

  if (
    declaredDuration !== null &&
    shots.length > 0 &&
    Math.abs(previousEnd - declaredDuration) > 1 + FLOAT_EPSILON
  ) {
    issues.push({
      shotIndex: null,
      message: `尾镜在 ${formatSeconds(previousEnd)} 结束,与总时长 ${formatSeconds(declaredDuration)} 不一致(误差需 ≤1 秒)。`,
    });
  }

  return { issues, timelineEnd: previousEnd, declaredDuration };
}

/** 单镜的连续性问题(供分镜行内联标注);与 validateStoryboard 同规则。 */
export function shotIssuesAt(validation: StoryboardValidation, index: number): string[] {
  return validation.issues
    .filter((issue) => issue.shotIndex === index)
    .map((issue) => issue.message);
}

export function formatSeconds(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}s`;
}

function asShot(value: unknown): { startSec: number; endSec: number } {
  const record = asRecord(value);
  return {
    startSec: numberOf(record?.startSec),
    endSec: numberOf(record?.endSec),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
