"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Crosshair, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  ArtifactContentData,
  ArtifactReference,
} from "@/hooks/creator/use-artifact";

const ROLE_LABEL: Record<string, string> = {
  inspiration: "灵感",
  facts: "事实",
  structure: "结构",
  style: "风格",
};

/**
 * 「评分与证据」标签:
 * - 维度评分与警告;警告可定位到对应内容块。
 * - 参考证据以轻量编号展示,详情在抽屉中查看。
 */
export function ScoreEvidencePanel(props: {
  content: ArtifactContentData;
  busyAction: "restore" | "score" | "export" | null;
  onRescore: () => void;
  onLocate: (dimensionKey: string) => void;
}) {
  const [openReference, setOpenReference] = useState<ArtifactReference | null>(null);
  const score = props.content.score;

  return (
    <div className="space-y-4 px-3.5 py-4">
      <section className="rounded-lg border border-[#E7E5E0] bg-[#FFFDF9] p-3.5">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-xs font-medium text-[#67625A]">发布前评分</p>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-lg border-[#DDD7CE] px-2 text-[11px]"
            disabled={props.busyAction !== null}
            onClick={props.onRescore}
            data-testid="artifact-rescore"
          >
            {props.busyAction === "score" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : null}
            重新评分
          </Button>
        </div>

        {score ? (
          <>
            <p className="mt-2 font-mono text-2xl font-semibold">
              {score.total}
              <span className="text-sm text-[#9C968C]"> / {score.maxScore}</span>
            </p>
            <ul className="mt-3 space-y-2.5">
              {score.dimensions.map((dimension) => (
                <li key={dimension.key} data-testid={`artifact-score-${dimension.key}`}>
                  <div className="flex items-center gap-2 text-sm">
                    {dimension.reasons.length === 0 ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#4A7C59]" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[#B0821B]" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{dimension.label}</span>
                    <span className="font-mono text-xs text-[#67625A]">
                      {dimension.score}/{dimension.maxScore}
                    </span>
                  </div>
                  {dimension.reasons.length > 0 ? (
                    <ul className="mt-1 space-y-1 pl-5">
                      {dimension.reasons.map((reason) => (
                        <li key={reason}>
                          <button
                            type="button"
                            className="inline-flex items-start gap-1 rounded-lg text-left text-xs leading-5 text-[#8A6414] underline decoration-dotted underline-offset-2 hover:text-[#6B4E0F]"
                            onClick={() => props.onLocate(dimension.key)}
                            data-testid="artifact-score-warning"
                          >
                            <Crosshair className="mt-0.5 h-3 w-3 shrink-0" />
                            {reason}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-[#746F67]">
            还没有评分。点击「重新评分」基于最新已保存版本评分。
          </p>
        )}
      </section>

      <section className="rounded-lg border border-[#E7E5E0] bg-[#FFFDF9] p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-[#67625A]">表达方向审查</p>
          {props.content.directionReview ? (
            <span className={props.content.directionReview.status === "passed"
              ? "rounded bg-[#E8F1EA] px-2 py-1 text-[10px] font-medium text-[#42664B]"
              : "rounded bg-[#FFF1D8] px-2 py-1 text-[10px] font-medium text-[#875A16]"}
            >
              {props.content.directionReview.status === "passed" ? "通过" : props.content.directionReview.status === "unavailable" ? "暂不可用" : "需关注"}
              {props.content.directionReview.score === undefined ? "" : ` · ${props.content.directionReview.score}`}
            </span>
          ) : null}
        </div>
        {props.content.directionReview ? (
          <div className="mt-2">
            <p className="text-sm font-medium text-[#292620]">
              {props.content.directionReview.primaryLabel}
              {props.content.directionReview.secondaryLabel ? ` + ${props.content.directionReview.secondaryLabel}` : ""}
            </p>
            <p className="mt-1 text-xs leading-5 text-[#746F67]">{props.content.directionReview.summary}</p>
            {props.content.directionReview.suggestions.length ? (
              <ul className="mt-2 space-y-1 text-xs leading-5 text-[#875A16]">
                {props.content.directionReview.suggestions.map((suggestion, index) => (
                  <li key={`${index}-${suggestion}`}>{index + 1}. {suggestion}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#746F67]">当前版本还没有方向审查结果；重新评分会同时检查表达方向。</p>
        )}
      </section>

      <section className="rounded-lg border border-[#E7E5E0] bg-[#FFFDF9] p-3.5">
        <p className="text-xs font-medium text-[#67625A]">参考证据</p>
        {props.content.references.length === 0 ? (
          <p className="mt-2 text-sm text-[#746F67]">
            本稿没有关联外部参考;从参考卡发起生成时会自动记录证据。
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {props.content.references.map((reference, index) => {
              const brief = asRecord(reference.snapshot);
              const source = asRecord(brief?.source);
              const title =
                stringOf(source?.title) || hostOf(reference.sourceUrl) || "参考来源";
              return (
                <li key={reference.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-[#F5F2EB]"
                    onClick={() => setOpenReference(reference)}
                    data-testid={`artifact-evidence-${index + 1}`}
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-[#EDE9E0] px-1.5 font-mono text-[11px] text-[#67625A]">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{title}</span>
                      <span className="mt-0.5 block text-[11px] text-[#9C968C]">
                        {ROLE_LABEL[reference.role] ?? reference.role} 参考 · 点击查看详情
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Sheet
        open={openReference !== null}
        onOpenChange={(open) => {
          if (!open) setOpenReference(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto border-[#DDD7CE] bg-[#FFFDF9] sm:max-w-md"
          data-testid="artifact-evidence-drawer"
        >
          <SheetTitle className="text-base">参考证据详情</SheetTitle>
          {openReference ? <ReferenceDetail reference={openReference} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ReferenceDetail({ reference }: { reference: ArtifactReference }) {
  const brief = asRecord(reference.snapshot);
  const source = asRecord(brief?.source);
  const structure = stringArrayOf(brief?.structure);
  const facts = recordArrayOf(brief?.facts);
  const boundaries = stringArrayOf(brief?.boundaries);

  return (
    <div className="mt-4 space-y-4 text-sm leading-6">
      <div>
        <p className="text-xs font-medium text-[#67625A]">来源</p>
        <p className="mt-1">{stringOf(source?.title) || "未命名来源"}</p>
        <p className="text-xs text-[#9C968C]">
          {stringOf(source?.platform) || "web"}
          {stringOf(source?.author) ? ` · ${stringOf(source?.author)}` : ""}
        </p>
        {reference.sourceUrl ? (
          <a
            href={reference.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 block truncate text-xs text-[#C83B32] underline underline-offset-2"
          >
            {reference.sourceUrl}
          </a>
        ) : null}
      </div>

      {stringOf(brief?.summary) ? (
        <div>
          <p className="text-xs font-medium text-[#67625A]">摘要</p>
          <p className="mt-1">{stringOf(brief?.summary)}</p>
        </div>
      ) : null}

      {structure.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-[#67625A]">可复用结构</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            {structure.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {facts.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-[#67625A]">可引用事实</p>
          <ul className="mt-1 space-y-1">
            {facts.map((fact, index) => (
              <li key={index} className="rounded-lg bg-[#FAF9F6] px-2 py-1.5 text-xs leading-5">
                {stringOf(fact.excerpt)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {boundaries.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-[#67625A]">不可模仿边界</p>
          <ul className="mt-1 space-y-1">
            {boundaries.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordArrayOf(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value
        .map((item) => asRecord(item))
        .filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

function stringArrayOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}
