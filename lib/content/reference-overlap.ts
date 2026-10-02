/**
 * 参考原文逐字重合检查(纯函数,前后端共用)。
 *
 * 「按参考结构生成原创稿」时,ReferenceBrief 中的 summary、opening、corePoints、
 * facts 都是原文摘录,模型能看到大段原句。这里在生成后测量草稿里有多少文字
 * 与这些摘录逐字相同,只测量、不判断是否侵权。参考可能是用户本人作品,
 * 因此结果只作为提醒,不阻塞发布。
 *
 * 计数口径参考 Easel `skills/shared/scripts/wordcount.py`:一个汉字、一个英文单词、
 * 一串数字各记 1 个单位;空白与标点不计,避免换标点就绕过检查。
 */

export type OverlapResult = {
  /** 草稿可比对单位数 */
  draftUnits: number;
  /** 草稿中落在逐字重合片段内的比例,0–1 */
  coverage: number;
  /** 最长连续重合单位数 */
  longestRun: number;
  /** 最长的若干段重合原文(草稿中的原样文字) */
  excerpts: string[];
};

type Unit = { token: string; start: number; end: number };

const UNIT_PATTERN = /[㐀-䶿一-鿿豈-﫿]|[A-Za-z]+(?:['-][A-Za-z]+)*|\d+(?:[.,]\d+)*/g;

/** 默认 10 个单位为一个比对窗口:常见口头禅短于此,整句照搬会超过。 */
export const OVERLAP_WINDOW = 10;

function unitsOf(text: string): Unit[] {
  return [...text.matchAll(UNIT_PATTERN)].map((match) => ({
    token: match[0].toLowerCase(),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function gramKey(units: Unit[], from: number, size: number): string {
  let key = "";
  for (let index = from; index < from + size; index += 1) key += `${units[index].token}\u0001`;
  return key;
}

export function measureReferenceOverlap(
  draftTexts: string[],
  referenceTexts: string[],
  window = OVERLAP_WINDOW,
): OverlapResult {
  const grams = new Set<string>();
  for (const reference of referenceTexts) {
    const units = unitsOf(reference);
    for (let index = 0; index + window <= units.length; index += 1) grams.add(gramKey(units, index, window));
  }

  let draftUnits = 0;
  let coveredUnits = 0;
  const runs: Array<{ length: number; text: string }> = [];
  for (const draft of draftTexts) {
    const units = unitsOf(draft);
    draftUnits += units.length;
    if (grams.size === 0 || units.length < window) continue;
    const covered = new Array<boolean>(units.length).fill(false);
    for (let index = 0; index + window <= units.length; index += 1) {
      if (!grams.has(gramKey(units, index, window))) continue;
      for (let offset = 0; offset < window; offset += 1) covered[index + offset] = true;
    }
    let runStart = -1;
    for (let index = 0; index <= units.length; index += 1) {
      if (index < units.length && covered[index]) {
        coveredUnits += 1;
        if (runStart < 0) runStart = index;
        continue;
      }
      if (runStart >= 0) {
        runs.push({ length: index - runStart, text: draft.slice(units[runStart].start, units[index - 1].end) });
        runStart = -1;
      }
    }
  }

  runs.sort((a, b) => b.length - a.length);
  return {
    draftUnits,
    coverage: draftUnits === 0 ? 0 : coveredUnits / draftUnits,
    longestRun: runs[0]?.length ?? 0,
    excerpts: runs.slice(0, 3).map((run) => (run.text.length > 40 ? `${run.text.slice(0, 40)}…` : run.text)),
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 从 ReferenceBrief 快照中取出原文摘录;结构异常的旧快照返回空数组。 */
export function referenceTextsOf(snapshot: unknown): string[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const brief = snapshot as Record<string, unknown>;
  const source =
    brief.source && typeof brief.source === "object" && !Array.isArray(brief.source)
      ? (brief.source as Record<string, unknown>)
      : {};
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  return [
    text(source.title),
    text(brief.summary),
    text(brief.opening),
    ...list(brief.structure).map((item) => text(item).replace(/^\d+\.\s*/, "")),
    ...list(brief.corePoints).map(text),
    ...list(brief.facts).map((item) =>
      item && typeof item === "object" ? text((item as Record<string, unknown>).excerpt) : "",
    ),
  ].filter((item) => item.trim() !== "");
}
