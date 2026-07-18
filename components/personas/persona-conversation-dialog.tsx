"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  PERSONA_CONVERSATION_STEPS,
  createPersonaDraft,
  type PersonaDraft,
} from "@/lib/personas/conversation";

type SaveStatus = "draft" | "active";

export function PersonaConversationDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seed: Record<string, unknown> | null;
  accountName: string;
  onSave: (draft: PersonaDraft, status: SaveStatus) => Promise<void>;
}) {
  const [draft, setDraft] = useState<PersonaDraft>(() => createPersonaDraft());
  const [stepIndex, setStepIndex] = useState(0);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState<SaveStatus | null>(null);
  const [saved, setSaved] = useState<SaveStatus | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const isReview = stepIndex >= PERSONA_CONVERSATION_STEPS.length;
  const currentStep = PERSONA_CONVERSATION_STEPS[stepIndex];

  useEffect(() => {
    if (!props.open) return;
    const next = createPersonaDraft(props.seed, props.accountName);
    setDraft(next);
    setStepIndex(0);
    setInput(next[PERSONA_CONVERSATION_STEPS[0].key]);
    setSaving(null);
    setSaved(null);
    setSaveError(null);
  }, [props.accountName, props.open, props.seed]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [stepIndex, saved, saveError]);

  function goToStep(index: number, nextDraft = draft) {
    const bounded = Math.max(0, Math.min(index, PERSONA_CONVERSATION_STEPS.length));
    setStepIndex(bounded);
    setInput(
      bounded < PERSONA_CONVERSATION_STEPS.length
        ? nextDraft[PERSONA_CONVERSATION_STEPS[bounded].key]
        : "",
    );
    setSaveError(null);
  }

  function submitAnswer(value = input) {
    if (!currentStep) return;
    const nextDraft = { ...draft, [currentStep.key]: value.trim() };
    setDraft(nextDraft);
    goToStep(stepIndex + 1, nextDraft);
  }

  function goBack() {
    if (stepIndex === 0) return;
    goToStep(stepIndex - 1);
  }

  async function save(status: SaveStatus) {
    setSaving(status);
    setSaveError(null);
    try {
      await props.onSave(draft, status);
      setSaved(status);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "保存人设失败，请稍后重试。");
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent side="right" className="flex h-full max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 sm:px-6">
          <DialogTitle>对话式人设编辑</DialogTitle>
          <DialogDescription>
            {props.seed ? "基于所选版本逐项确认，保存后生成新版本。" : "回答几个问题，系统会整理成可复用的人设版本。"}
          </DialogDescription>
          <div className="flex items-center gap-3 pt-2">
            <Progress
              className="h-1.5"
              value={(Math.min(stepIndex, PERSONA_CONVERSATION_STEPS.length) / PERSONA_CONVERSATION_STEPS.length) * 100}
            />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {Math.min(stepIndex + 1, PERSONA_CONVERSATION_STEPS.length)}/{PERSONA_CONVERSATION_STEPS.length}
            </span>
          </div>
        </DialogHeader>

        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-5 sm:px-6">
          <AssistantBubble>我们会逐项确认身份、受众、表达方式和边界。已有内容可以直接沿用，也可以在回答框里修改。</AssistantBubble>

          {PERSONA_CONVERSATION_STEPS.slice(0, stepIndex).map((step) => (
            <div key={step.key} className="mt-5 space-y-3">
              <AssistantBubble>{step.question}</AssistantBubble>
              <UserBubble>{draft[step.key] || "暂不设置"}</UserBubble>
            </div>
          ))}

          {!isReview ? (
            <div className="mt-5">
              <AssistantBubble>
                <span className="block">{currentStep.question}</span>
                {draft[currentStep.key] ? (
                  <span className="mt-2 block text-xs text-muted-foreground">已带入当前版本的答案，可直接修改后继续。</span>
                ) : null}
              </AssistantBubble>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              <AssistantBubble>
                {saved
                  ? saved === "active"
                    ? "新的人设版本已保存并激活，后续创作会使用它。"
                    : "人设草稿已经保存，可以稍后继续完善或激活。"
                  : "信息已经整理完成。请检查下面的摘要，然后保存为草稿或直接激活。"}
              </AssistantBubble>
              {!saved ? (
                <dl className="divide-y border-y bg-background px-4">
                  {PERSONA_CONVERSATION_STEPS.map((step) => (
                    <div key={step.key} className="grid gap-1 py-3 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-4">
                      <dt className="text-xs font-medium text-muted-foreground">{step.label}</dt>
                      <dd className="whitespace-pre-wrap text-sm leading-5">{draft[step.key] || "未设置"}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="flex justify-end">
                  <Button onClick={() => props.onOpenChange(false)}><Check data-icon="inline-start" />完成</Button>
                </div>
              )}
              {saveError ? <p role="alert" className="text-sm text-destructive">{saveError}</p> : null}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {!saved ? (
          <div className="shrink-0 border-t bg-background p-4 sm:p-5">
            {!isReview ? (
              <>
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      submitAnswer();
                    }
                  }}
                  aria-label="回复人设助手"
                  placeholder={currentStep.placeholder}
                  className="max-h-40 min-h-24 resize-none"
                  autoFocus
                />
                <div className="mt-3 flex items-center gap-2">
                  <Button size="icon" variant="outline" title="上一步" onClick={goBack} disabled={stepIndex === 0}>
                    <ArrowLeft />
                  </Button>
                  <Button variant="ghost" onClick={() => submitAnswer("")}>暂不设置</Button>
                  <Button className="ml-auto" onClick={() => submitAnswer()}>
                    {draft[currentStep.key] && input === draft[currentStep.key] ? "沿用并继续" : "发送并继续"}
                    <Send data-icon="inline-end" />
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={goBack} disabled={Boolean(saving)}><ArrowLeft data-icon="inline-start" />返回修改</Button>
                <Button className="ml-auto" variant="outline" onClick={() => void save("draft")} disabled={Boolean(saving)}>
                  {saving === "draft" ? <Loader2 className="animate-spin" /> : null}保存草稿
                </Button>
                <Button onClick={() => void save("active")} disabled={Boolean(saving)}>
                  {saving === "active" ? <Loader2 className="animate-spin" /> : <Sparkles />}保存并激活
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex max-w-[92%] items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Sparkles className="h-3.5 w-3.5" />
      </span>
      <div className="rounded-lg rounded-tl-sm border bg-background px-3.5 py-2.5 text-sm leading-6 shadow-sm">{children}</div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return <div className="ml-auto max-w-[84%] rounded-lg rounded-tr-sm bg-primary px-3.5 py-2.5 text-sm leading-6 text-primary-foreground">{children}</div>;
}
