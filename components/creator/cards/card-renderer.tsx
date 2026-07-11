"use client";

import { useState } from "react";
import type { ArtifactCard, ChatCard } from "@/lib/creator/chat-protocol";
import { actionKeyOf } from "@/lib/creator/conversation-client";
import { OptionCardView } from "@/components/creator/cards/option-card";
import { NoticeCardView } from "@/components/creator/cards/notice-card";
import { ProgressCardView } from "@/components/creator/cards/progress-card";
import { ApprovalCardView } from "@/components/creator/cards/approval-card";
import { ReferenceCardView } from "@/components/creator/cards/reference-card";
import { ArtifactCardView } from "@/components/creator/cards/artifact-card";

export type CardInvokeState = {
  phase: "idle" | "loading" | "success" | "failed";
  error?: string;
};

export type InvokeCardAction = (params: {
  sourceMessageId: string;
  cardId: string;
  actionId: string;
  values?: { optionIds?: string[]; text?: string };
}) => Promise<void>;

/** 计算某卡片上已被处理过的 actionId 列表(依据服务端幂等键)。 */
function processedActionIds(card: ChatCard, processedKeys: string[]): string[] {
  const candidates: string[] = [];
  if (card.type === "option") candidates.push(card.submitAction.actionId);
  if (card.type === "approval")
    candidates.push(card.confirmAction.actionId, card.cancelAction.actionId);
  if ("actions" in card && card.actions)
    candidates.push(...card.actions.map((action) => action.actionId));
  return candidates.filter((actionId) =>
    processedKeys.includes(actionKeyOf(card.id, actionId)),
  );
}

export function CardRenderer(props: {
  card: ChatCard;
  sourceMessageId: string;
  processedKeys: string[];
  onInvoke: InvokeCardAction;
  /** 成果卡「打开编辑」的本地处理(打开 Artifact 面板),不回传服务端 */
  onArtifactOpen?: (card: ArtifactCard) => void;
  /** 成果卡「继续优化」的本地处理(预填输入框),不回传服务端 */
  onArtifactRefine?: (card: ArtifactCard) => void;
  /** 进度卡对应任务进入终态时通知(用于刷新消息流,接收成果卡) */
  onJobSettled?: () => void;
}) {
  const [state, setState] = useState<CardInvokeState>({ phase: "idle" });
  const processed = processedActionIds(props.card, props.processedKeys);

  async function invoke(actionId: string, values?: { optionIds?: string[]; text?: string }) {
    setState({ phase: "loading" });
    try {
      await props.onInvoke({
        sourceMessageId: props.sourceMessageId,
        cardId: props.card.id,
        actionId,
        values,
      });
      setState({ phase: "success" });
    } catch (error) {
      setState({
        phase: "failed",
        error: error instanceof Error ? error.message : "执行失败",
      });
    }
  }

  switch (props.card.type) {
    case "option":
      return (
        <OptionCardView
          card={props.card}
          state={state}
          processed={processed.length > 0}
          onSubmit={(optionIds) =>
            void invoke(props.card.type === "option" ? props.card.submitAction.actionId : "", {
              optionIds,
            })
          }
        />
      );
    case "notice":
      return (
        <NoticeCardView
          card={props.card}
          state={state}
          processedActionIds={processed}
          onInvoke={(actionId) => void invoke(actionId)}
        />
      );
    case "progress":
      return <ProgressCardView card={props.card} onSettled={props.onJobSettled} />;
    case "reference":
      return (
        <ReferenceCardView
          card={props.card}
          state={state}
          processedActionIds={processed}
          onInvoke={(actionId) => void invoke(actionId)}
        />
      );
    case "artifact":
      return (
        <ArtifactCardView
          card={props.card}
          state={state}
          onInvoke={(actionId) => void invoke(actionId)}
          onOpen={props.onArtifactOpen}
          onRefine={props.onArtifactRefine}
        />
      );
    case "approval":
      return (
        <ApprovalCardView
          card={props.card}
          state={state}
          processedActionIds={processed}
          onInvoke={(actionId) => void invoke(actionId)}
        />
      );
    default:
      // reference / artifact 卡由 C4/C5 接入;此处不渲染假界面
      return null;
  }
}
