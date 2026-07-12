"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CircleX,
  Link2,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  CardAction,
  PublishReadinessCard as PublishReadinessCardType,
} from "@/lib/creator/chat-protocol";
import type { CardInvokeState } from "@/components/creator/cards/card-renderer";

const PLATFORM_LABEL = { xiaohongshu: "小红书图文", douyin: "抖音脚本" } as const;

const STATE_BADGE = {
  ready: { label: "已就绪", className: "bg-[#E9EFE6] text-[#3F6B4F]" },
  warnings: { label: "有提醒", className: "bg-[#F5EEDC] text-[#8A6414]" },
  blocked: { label: "有阻塞", className: "bg-[#F7E3E1] text-[#8A2B24]" },
} as const;

const CONNECTION_LABEL = {
  connected: "已配置(本地状态)",
  missing: "未配置",
  invalid: "已失效",
} as const;

const LEVEL_ICON = {
  pass: { icon: CircleCheck, className: "text-[#4A7C59]" },
  warn: { icon: AlertTriangle, className: "text-[#B07E18]" },
  block: { icon: CircleX, className: "text-[#C83B32]" },
} as const;

/**
 * 发布就绪卡(C8):平台、版本、检查项、供应商连接的本地状态与后续动作。
 * 「打开检查清单」「复制待处理项」「打开连接设置」由客户端本地处理;
 * 「确认并移交发布中心」「重新检查」回传服务端注册表执行。
 * 确认按钮带二次点击防误触;确认后该卡固定显示已移交。
 */
export function PublishReadinessCardView(props: {
  card: PublishReadinessCardType;
  state: CardInvokeState;
  processedActionIds: string[];
  onInvoke: (actionId: string) => void;
  onOpenChecklist?: (card: PublishReadinessCardType) => void;
  onCopyMissing?: (card: PublishReadinessCardType) => void;
  onOpenConnections?: () => void;
}) {
  const [armedActionId, setArmedActionId] = useState<string | null>(null);
  const [passExpanded, setPassExpanded] = useState(false);

  const confirmed = props.processedActionIds.includes("publish.confirm_handoff");
  const busy = props.state.phase === "loading";
  const badge = STATE_BADGE[props.card.state];
  const pending = props.card.items.filter((item) => item.level !== "pass");
  const passed = props.card.items.filter((item) => item.level === "pass");

  function handleAction(action: CardAction) {
    if (action.actionId === "publish.open_checklist" && props.onOpenChecklist) {
      props.onOpenChecklist(props.card);
      return;
    }
    if (action.actionId === "publish.copy_missing" && props.onCopyMissing) {
      props.onCopyMissing(props.card);
      return;
    }
    if (action.actionId === "connection.open" && props.onOpenConnections) {
      props.onOpenConnections();
      return;
    }
    if (action.requiresConfirmation && armedActionId !== action.actionId) {
      setArmedActionId(action.actionId);
      return;
    }
    setArmedActionId(null);
    props.onInvoke(action.actionId);
  }

  return (
    <div
      className="mt-2 max-w-md rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-3.5"
      data-testid={`card-publish-ready-${props.card.id}`}
      data-publish-state={props.card.state}
      data-confirmed={confirmed ? "true" : "false"}
    >
      <div className="flex items-start gap-2.5">
        <Send className="mt-0.5 h-4 w-4 shrink-0 text-[#C83B32]" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">发布就绪检查</p>
            <span className={cn("rounded px-1.5 py-0.5 text-[10px]", badge.className)}>
              {badge.label}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-[#746F67]">
            {props.card.title} · {PLATFORM_LABEL[props.card.platform]} ·{" "}
            <span className="font-mono">v{props.card.revisionNumber}</span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-[#746F67]">
            <Link2 className="h-3 w-3 shrink-0" aria-hidden />
            供应商连接:{CONNECTION_LABEL[props.card.connection]}
          </p>
        </div>
      </div>

      {pending.length > 0 ? (
        <ul className="mt-2.5 space-y-1.5" data-testid="publish-ready-pending">
          {pending.map((item) => {
            const level = LEVEL_ICON[item.level];
            const Icon = level.icon;
            return (
              <li key={item.key} className="flex items-start gap-1.5 text-xs leading-5">
                <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", level.className)} aria-hidden />
                <span className="min-w-0">
                  <span className="font-medium">{item.label}</span>
                  {item.detail ? <span className="text-[#746F67]">:{item.detail}</span> : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {passed.length > 0 ? (
        <div className="mt-2">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-[#67625A] hover:text-[#1F1D19]"
            aria-expanded={passExpanded}
            onClick={() => setPassExpanded((value) => !value)}
            data-testid="publish-ready-pass-toggle"
          >
            {passExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            )}
            已通过 {passed.length} 项
          </button>
          {passExpanded ? (
            <ul className="mt-1.5 space-y-1.5">
              {passed.map((item) => (
                <li key={item.key} className="flex items-start gap-1.5 text-xs leading-5">
                  <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4A7C59]" aria-hidden />
                  <span className="min-w-0 text-[#67625A]">
                    <span className="font-medium text-[#1F1D19]">{item.label}</span>
                    {item.detail ? <span>:{item.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {confirmed ? (
          <span
            className="inline-flex items-center gap-1 text-xs text-[#3F6B4F]"
            data-testid="publish-ready-confirmed"
          >
            <Check className="h-3.5 w-3.5" aria-hidden /> 已确认移交发布中心
          </span>
        ) : null}
        {props.card.actions
          .filter((action) => !(confirmed && action.actionId === "publish.confirm_handoff"))
          .map((action) => (
            <Button
              key={action.actionId}
              size="sm"
              variant={action.appearance === "primary" ? "default" : "outline"}
              className={cn(
                "rounded-lg",
                action.appearance === "primary"
                  ? "bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]"
                  : action.appearance === "ghost"
                    ? "border-transparent text-[#67625A]"
                    : "border-[#DDD7CE]",
              )}
              disabled={busy}
              onClick={() => handleAction(action)}
              data-testid={`publish-action-${action.actionId}`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {action.requiresConfirmation && armedActionId === action.actionId
                ? "再次点击确认"
                : action.label}
            </Button>
          ))}
        {props.state.phase === "failed" ? (
          <span className="text-xs text-[#C83B32]">{props.state.error ?? "执行失败,可重试"}</span>
        ) : null}
      </div>
    </div>
  );
}
