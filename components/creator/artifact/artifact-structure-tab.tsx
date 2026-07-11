"use client";

import { artifactBlockAnchor, artifactItemAnchor } from "@/lib/creator/artifact-locator";
import { formatSeconds, validateStoryboard } from "@/lib/content/storyboard";

/**
 * 「结构」标签:当前版本的只读大纲。
 * 小红书 → 页序概览(小标题 + 摘要 + 字数);抖音 → 时间轴概览(比例条 + 逐镜一行)。
 * 点击条目跳到「内容」标签中对应的编辑块;逐字段编辑都在「内容」标签完成。
 */
export function ArtifactStructureTab(props: {
  contentKind: "xhs_graphic" | "douyin_video_script";
  structuredContent: unknown;
  onJumpTo: (anchor: string) => void;
}) {
  const structured = asRecord(props.structuredContent);
  if (!structured) {
    return (
      <p className="px-3.5 py-8 text-center text-sm text-[#746F67]">
        该版本没有结构化数据。
      </p>
    );
  }

  return (
    <div
      data-artifact-block={artifactBlockAnchor("structure")}
      className="space-y-3 rounded-xl px-3.5 py-4"
    >
      {props.contentKind === "xhs_graphic" ? (
        <XhsOutline structured={structured} onJumpTo={props.onJumpTo} />
      ) : (
        <DouyinOutline structured={structured} onJumpTo={props.onJumpTo} />
      )}
      <p className="text-xs leading-5 text-[#9C968C]">
        点击条目可跳到「内容」标签中的对应位置直接编辑。
      </p>
    </div>
  );
}

function XhsOutline({
  structured,
  onJumpTo,
}: {
  structured: Record<string, unknown>;
  onJumpTo: (anchor: string) => void;
}) {
  const pages = recordArray(structured.pages);
  if (pages.length === 0) {
    return <p className="text-sm text-[#746F67]">该版本没有分页结构。</p>;
  }
  const totalChars = pages.reduce(
    (sum, page) => sum + stringOf(page.body).length,
    0,
  );
  return (
    <>
      <p className="text-xs text-[#67625A]">
        共 {pages.length} 页 · 正文约{" "}
        <span className="font-mono">{totalChars}</span> 字
      </p>
      <ol className="space-y-1.5">
        {pages.map((page, index) => {
          const body = stringOf(page.body);
          return (
            <li key={index}>
              <button
                type="button"
                className="flex w-full items-start gap-2 rounded-xl border border-[#E7E5E0] bg-[#FFFDF9] p-2.5 text-left hover:border-[#DDD7CE] hover:bg-[#FAF9F6]"
                data-testid={`artifact-structure-page-${index + 1}`}
                onClick={() => onJumpTo(artifactItemAnchor("pages", index))}
              >
                <span className="mt-0.5 shrink-0 rounded bg-[#EDE9E0] px-1.5 py-0.5 font-mono text-[11px] text-[#67625A]">
                  {numberOf(page.pageNumber, index + 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {stringOf(page.heading) || "未命名"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs leading-5 text-[#746F67]">
                    {body || "(本页暂无正文)"}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-[#9C968C]">
                  {body.length} 字
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function DouyinOutline({
  structured,
  onJumpTo,
}: {
  structured: Record<string, unknown>;
  onJumpTo: (anchor: string) => void;
}) {
  const shots = recordArray(structured.shots);
  const hook = stringOf(structured.hook);
  const validation = validateStoryboard(structured);
  if (shots.length === 0) {
    return <p className="text-sm text-[#746F67]">该版本没有分镜结构。</p>;
  }
  const totalSpan = Math.max(validation.timelineEnd, 1);
  return (
    <>
      <p className="text-xs text-[#67625A]">
        共 {shots.length} 镜 · 声明总时长{" "}
        <span className="font-mono">
          {formatSeconds(validation.declaredDuration ?? 0)}
        </span>{" "}
        · 尾镜结束于 <span className="font-mono">{formatSeconds(validation.timelineEnd)}</span>
        {hook ? ` · 钩子:${hook}` : ""}
      </p>

      {/* 时间轴比例条:每段宽度按镜头时长占比 */}
      <div
        className="flex h-3 w-full overflow-hidden rounded-lg border border-[#E7E5E0] bg-[#F0EDE6]"
        aria-hidden
      >
        {shots.map((shot, index) => {
          const span = Math.max(
            numberOf(shot.endSec, 0) - numberOf(shot.startSec, 0),
            0,
          );
          return (
            <span
              key={index}
              className={index % 2 === 0 ? "h-full bg-[#D8C7B2]" : "h-full bg-[#EADFCE]"}
              style={{ width: `${(span / totalSpan) * 100}%` }}
            />
          );
        })}
      </div>

      {validation.issues.length > 0 ? (
        <p className="rounded-lg bg-[#FDF6E7] px-2.5 py-1.5 text-[11px] leading-5 text-[#8A6414]">
          时间轴有 {validation.issues.length} 个问题,详见「内容」标签的分镜区。
        </p>
      ) : null}

      <ol className="space-y-1.5">
        {shots.map((shot, index) => (
          <li key={index}>
            <button
              type="button"
              className="flex w-full items-start gap-2 rounded-xl border border-[#E7E5E0] bg-[#FFFDF9] p-2.5 text-left hover:border-[#DDD7CE] hover:bg-[#FAF9F6]"
              data-testid={`artifact-structure-shot-${index + 1}`}
              onClick={() => onJumpTo(artifactItemAnchor("shots", index))}
            >
              <span className="mt-0.5 shrink-0 rounded bg-[#EDE9E0] px-1.5 py-0.5 font-mono text-[11px] text-[#67625A]">
                {formatSeconds(numberOf(shot.startSec, 0))}–
                {formatSeconds(numberOf(shot.endSec, 0))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm leading-6">
                  {stringOf(shot.voiceover) || "未填写口播"}
                </span>
                <span className="mt-0.5 block truncate text-[11px] leading-4 text-[#9C968C]">
                  画面:{stringOf(shot.visual) || "未填写"} · 字幕:
                  {stringOf(shot.subtitle) || "未填写"}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item) => asRecord(item) ?? {})
    : [];
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
