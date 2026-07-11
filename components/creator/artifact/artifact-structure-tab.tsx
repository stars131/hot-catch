"use client";

import { artifactBlockAnchor } from "@/lib/creator/artifact-locator";

/**
 * 「结构」标签:只读展示当前版本的结构化数据。
 * 小红书 → 分页;抖音 → 分镜时间轴(默认只露出时间/口播/画面/字幕,高级项 C6 开放)。
 */
export function ArtifactStructureTab(props: {
  contentKind: "xhs_graphic" | "douyin_video_script";
  structuredContent: unknown;
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
        <XhsPages structured={structured} />
      ) : (
        <DouyinShots structured={structured} />
      )}
      <p className="text-xs leading-5 text-[#9C968C]">
        结构为只读预览;逐页/逐镜编辑将在下一批次开放,当前可在对话中让星迹调整结构。
      </p>
    </div>
  );
}

function XhsPages({ structured }: { structured: Record<string, unknown> }) {
  const pages = recordArray(structured.pages);
  if (pages.length === 0) {
    return <p className="text-sm text-[#746F67]">该版本没有分页结构。</p>;
  }
  return (
    <>
      {pages.map((page, index) => (
        <section
          key={index}
          className="rounded-xl border border-[#E7E5E0] bg-[#FFFDF9] p-3"
          data-testid={`artifact-structure-page-${index + 1}`}
        >
          <p className="text-xs font-medium text-[#67625A]">
            第 {numberOf(page.pageNumber, index + 1)} 页 · {stringOf(page.heading) || "未命名"}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6">
            {stringOf(page.body)}
          </p>
          {stringOf(page.visualSuggestion) ? (
            <p className="mt-2 rounded-lg bg-[#FAF9F6] px-2 py-1.5 text-xs leading-5 text-[#746F67]">
              视觉:{stringOf(page.visualSuggestion)}
            </p>
          ) : null}
        </section>
      ))}
    </>
  );
}

function DouyinShots({ structured }: { structured: Record<string, unknown> }) {
  const shots = recordArray(structured.shots);
  const duration = numberOf(structured.durationSec, 0);
  const hook = stringOf(structured.hook);
  if (shots.length === 0) {
    return <p className="text-sm text-[#746F67]">该版本没有分镜结构。</p>;
  }
  return (
    <>
      <p className="text-xs text-[#67625A]">
        总时长 <span className="font-mono">{duration}</span> 秒
        {hook ? ` · 钩子:${hook}` : ""}
      </p>
      {shots.map((shot, index) => (
        <section
          key={index}
          className="rounded-xl border border-[#E7E5E0] bg-[#FFFDF9] p-3"
          data-testid={`artifact-structure-shot-${index + 1}`}
        >
          <p className="font-mono text-xs text-[#67625A]">
            {numberOf(shot.startSec, 0)}–{numberOf(shot.endSec, 0)}s
          </p>
          <p className="mt-1.5 text-sm leading-6">{stringOf(shot.voiceover)}</p>
          <p className="mt-1.5 text-xs leading-5 text-[#746F67]">
            画面:{stringOf(shot.visual) || "未填写"}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-[#746F67]">
            字幕:{stringOf(shot.subtitle) || "未填写"}
          </p>
        </section>
      ))}
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
