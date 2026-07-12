"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Link2,
  Loader2,
  MessageSquareShare,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readApiJson } from "@/lib/api-client";
import {
  assessContentReadiness,
  readinessStateLabel,
  type ReadinessItem,
} from "@/lib/creator/publish-readiness";
import type { ArtifactDraft } from "@/hooks/creator/use-artifact";

type ConnectionState = "connected" | "missing" | "invalid" | "loading" | "unknown";

const CONNECTION_TEXT: Record<Exclude<ConnectionState, "loading">, { label: string; detail: string }> = {
  connected: {
    label: "已配置(本地状态)",
    detail: "真实可用性以发布中心实际加载账号为准;本清单不调用供应商。",
  },
  missing: {
    label: "未配置",
    detail: "尚未配置 AiToEarn 凭证:移交后无法加载发布账号,请先完成连接。",
  },
  invalid: {
    label: "已失效",
    detail: "AiToEarn 凭证已失效或被撤销,请到连接设置重新配置。",
  },
  unknown: {
    label: "状态未知",
    detail: "暂时无法读取连接状态;不影响内容检查,移交前请在连接设置确认。",
  },
};

const LEVEL_META = {
  block: { icon: CircleX, className: "text-[#C83B32]", group: "阻塞项" },
  warn: { icon: AlertTriangle, className: "text-[#B07E18]", group: "建议处理" },
  pass: { icon: CircleCheck, className: "text-[#4A7C59]", group: "已通过" },
} as const;

function ItemRow({ item }: { item: ReadinessItem }) {
  const meta = LEVEL_META[item.level];
  const Icon = meta.icon;
  return (
    <li className="flex items-start gap-2 rounded-lg px-1 py-1 text-sm leading-6">
      <Icon className={cn("mt-1 h-4 w-4 shrink-0", meta.className)} aria-hidden />
      <span className="min-w-0">
        <span className="font-medium">{item.label}</span>
        {item.detail ? (
          <span className="block text-xs leading-5 text-[#746F67]">{item.detail}</span>
        ) : null}
      </span>
    </li>
  );
}

/**
 * 发布就绪清单(C8):对当前草稿(含未保存修改)做平台特定检查,
 * 与服务端就绪卡共用同一套纯校验规则;凭证状态只读本地接口,不调用供应商。
 * 「在对话中发起发布确认」会先保存草稿,再由对话生成就绪卡,由用户显式确认移交;
 * 本阶段不接入真实发布,清单上不存在任何直接发布按钮。
 */
export function PublishChecklist(props: {
  contentKind: "xhs_graphic" | "douyin_video_script";
  platform: "xiaohongshu" | "douyin";
  draft: ArtifactDraft;
  fallbackTags: string[];
  revisionNumber: number | null;
  dirty: boolean;
  previewing: boolean;
  sending: boolean;
  onClose: () => void;
  onConfirmToConversation: () => void;
}) {
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [passExpanded, setPassExpanded] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  const assessment = useMemo(
    () =>
      assessContentReadiness({
        contentKind: props.contentKind,
        title: props.draft.title,
        body: props.draft.body,
        structured: props.draft.structured,
        fallbackTags: props.fallbackTags,
      }),
    [props.contentKind, props.draft, props.fallbackTags],
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // 只读本地凭证摘要接口(状态与尾号),不触发任何供应商请求
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await readApiJson<{
          credentials: Array<{ provider: string; status: string }>;
        }>(await fetch("/api/settings/credentials", { cache: "no-store" }));
        if (cancelled) return;
        const aitoearn = data.credentials.find((item) => item.provider === "aitoearn");
        if (!aitoearn || aitoearn.status === "missing") setConnection("missing");
        else if (aitoearn.status === "active") setConnection("connected");
        else setConnection("invalid");
      } catch {
        if (!cancelled) setConnection("unknown");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const blockItems = assessment.items.filter((item) => item.level === "block");
  const warnItems = assessment.items.filter((item) => item.level === "warn");
  const passItems = assessment.items.filter((item) => item.level === "pass");
  const connectionMeta = CONNECTION_TEXT[connection === "loading" ? "unknown" : connection];
  const disabled =
    props.sending || props.previewing || assessment.state === "blocked";
  const disabledHint = props.previewing
    ? "正在查看历史版本,回到最新版后再发起。"
    : assessment.state === "blocked"
      ? "先处理上方阻塞项,再发起发布确认。"
      : null;

  return (
    <div
      role="dialog"
      aria-label="发布就绪清单"
      data-testid="publish-checklist"
      data-checklist-state={assessment.state}
      className="absolute inset-0 z-20 flex min-h-0 flex-col bg-[#FFFDF9]"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-[#E7E5E0] px-3.5 pb-2.5 pt-3">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight outline-none"
        >
          发布就绪清单
          <span className="ml-2 rounded bg-[#EDE9E0] px-1.5 py-0.5 font-mono text-[10px] font-normal text-[#67625A]">
            {props.revisionNumber ? `v${props.revisionNumber}` : "未保存"}
          </span>
          <span
            className={cn(
              "ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-normal",
              assessment.state === "ready"
                ? "bg-[#E9EFE6] text-[#3F6B4F]"
                : assessment.state === "warnings"
                  ? "bg-[#F5EEDC] text-[#8A6414]"
                  : "bg-[#F7E3E1] text-[#8A2B24]",
            )}
            data-testid="publish-checklist-state"
          >
            {readinessStateLabel(assessment.state)}
          </span>
        </h3>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 rounded-lg"
          aria-label="关闭发布清单"
          data-testid="publish-checklist-close"
          onClick={props.onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {blockItems.length > 0 ? (
          <section className="mb-3">
            <h4 className="text-xs font-medium text-[#8A2B24]">
              阻塞项({blockItems.length})
            </h4>
            <ul className="mt-1 space-y-0.5" data-testid="publish-checklist-blocks">
              {blockItems.map((item) => (
                <ItemRow key={item.key} item={item} />
              ))}
            </ul>
          </section>
        ) : null}

        {warnItems.length > 0 ? (
          <section className="mb-3">
            <h4 className="text-xs font-medium text-[#8A6414]">
              建议处理({warnItems.length})
            </h4>
            <ul className="mt-1 space-y-0.5" data-testid="publish-checklist-warnings">
              {warnItems.map((item) => (
                <ItemRow key={item.key} item={item} />
              ))}
            </ul>
          </section>
        ) : null}

        <section className="mb-3">
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-[#3F6B4F]"
            aria-expanded={passExpanded}
            onClick={() => setPassExpanded((value) => !value)}
            data-testid="publish-checklist-pass-toggle"
          >
            {passExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            已通过({passItems.length})
          </button>
          {passExpanded ? (
            <ul className="mt-1 space-y-0.5">
              {passItems.map((item) => (
                <ItemRow key={item.key} item={item} />
              ))}
            </ul>
          ) : null}
        </section>

        <section
          className="rounded-xl border border-[#E7E5E0] bg-[#FAF9F6] p-3"
          data-testid="publish-checklist-connection"
          data-connection={connection}
        >
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Link2 className="h-3.5 w-3.5 shrink-0 text-[#67625A]" aria-hidden />
            供应商连接:
            {connection === "loading" ? (
              <span className="inline-flex items-center gap-1 text-[#746F67]">
                <Loader2 className="h-3 w-3 animate-spin" /> 读取中…
              </span>
            ) : (
              connectionMeta.label
            )}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#746F67]">{connectionMeta.detail}</p>
          {connection === "missing" || connection === "invalid" ? (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="mt-2 rounded-lg border-[#DDD7CE]"
              data-testid="publish-checklist-connect"
            >
              <Link href="/settings/connections">打开连接设置</Link>
            </Button>
          ) : null}
        </section>
      </div>

      <div className="shrink-0 border-t border-[#E7E5E0] px-3.5 pb-3 pt-2.5">
        <p className="text-xs leading-5 text-[#746F67]">
          {props.dirty ? "发起前会先保存当前修改。" : null}
          确认后会在对话中生成就绪卡,由你显式确认移交发布中心;当前阶段未接入真实供应商,
          系统不会自动发布。
        </p>
        {disabledHint ? (
          <p className="mt-1 text-xs leading-5 text-[#8A2B24]" data-testid="publish-checklist-hint">
            {disabledHint}
          </p>
        ) : null}
        <Button
          className="mt-2 w-full rounded-lg bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]"
          disabled={disabled}
          onClick={props.onConfirmToConversation}
          data-testid="publish-checklist-confirm"
        >
          {props.sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MessageSquareShare className="h-4 w-4" />
          )}
          在对话中发起发布确认
        </Button>
      </div>
    </div>
  );
}
