"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  KeyRound,
  ListChecks,
  Loader2,
  LockKeyhole,
  PauseCircle,
  Play,
  Settings2,
  XCircle,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { readApiJson } from "@/lib/api-client";
import type { ProgressCard as ProgressCardType } from "@/lib/creator/chat-protocol";
import { describeJobInputRequest } from "@/lib/jobs/input-request";
import {
  LLM_PROVIDER_DEFINITIONS,
  LLM_PROVIDER_IDS,
  type LlmProviderId,
} from "@/lib/providers/llm-config";

type JobView = {
  id: string;
  status: "queued" | "running" | "waiting_input" | "succeeded" | "failed" | "canceled";
  progress: number;
  stage: string | null;
  output: unknown;
  errorMessage: string | null;
  messageKey: string | null;
};

const TERMINAL = ["succeeded", "failed", "canceled"];

export function ProgressCardView(props: {
  card: ProgressCardType;
  onSettled?: () => void;
  onOpenConnections?: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations("Tasks");
  const te = useTranslations("Errors");
  const [activeJobId, setActiveJobId] = useState(props.card.jobId);
  const [job, setJob] = useState<JobView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [supplement, setSupplement] = useState("");
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const onSettledRef = useRef(props.onSettled);
  const previousStatusRef = useRef<JobView["status"] | null>(null);
  onSettledRef.current = props.onSettled;

  useEffect(() => {
    setActiveJobId(props.card.jobId);
    setJob(null);
    setLoadError(null);
    previousStatusRef.current = null;
  }, [props.card.jobId]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    previousStatusRef.current = null;

    async function poll() {
      try {
        const data = await readApiJson<{ job: JobView }>(
          await fetch(`/api/jobs/${activeJobId}`, { cache: "no-store" }),
        );
        if (stopped) return;
        setJob(data.job);
        setLoadError(null);
        const previous = previousStatusRef.current;
        previousStatusRef.current = data.job.status;
        if (previous && !TERMINAL.includes(previous) && TERMINAL.includes(data.job.status)) {
          onSettledRef.current?.();
        }
        if (!TERMINAL.includes(data.job.status) && data.job.status !== "waiting_input") {
          timer = window.setTimeout(() => void poll(), 2000);
        }
      } catch (error) {
        if (stopped) return;
        setLoadError(locale === "zh-CN" && error instanceof Error ? error.message : t("loadFailed"));
      }
    }

    void poll();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeJobId, locale, t]);

  async function cancel() {
    setCanceling(true);
    try {
      await readApiJson(await fetch(`/api/jobs/${activeJobId}/cancel`, { method: "POST" }));
      setJob((current) => (current ? { ...current, status: "canceled" } : current));
    } catch (error) {
      setLoadError(locale === "zh-CN" && error instanceof Error ? error.message : t("cancelFailed"));
    } finally {
      setCanceling(false);
    }
  }

  async function resume(text?: string) {
    setResuming(true);
    setLoadError(null);
    try {
      const data = await readApiJson<{ job: JobView }>(
        await fetch(`/api/jobs/${activeJobId}/resume`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: text?.trim() || undefined }),
        }),
      );
      setSupplement("");
      setModelPanelOpen(false);
      setJob(data.job);
      setActiveJobId(data.job.id);
      previousStatusRef.current = null;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : (locale === "zh-CN" ? "任务继续失败" : "Could not resume the task"));
    } finally {
      setResuming(false);
    }
  }

  const phase = !job
    ? "loading"
    : job.status === "succeeded"
      ? "success"
      : job.status === "failed" || job.status === "canceled"
        ? "failed"
        : job.status === "waiting_input"
          ? "waiting"
          : "loading";
  const inputRequest = job?.status === "waiting_input"
    ? describeJobInputRequest(job.output, locale)
    : null;
  const waitingReason = job && typeof job.output === "object" && job.output !== null && "reason" in job.output
    ? String((job.output as { reason?: unknown }).reason ?? "")
    : "";

  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-2 mt-2 max-w-lg rounded-xl border border-[#DDD7CE] bg-[#FFFDF9] p-3.5 shadow-[0_8px_24px_rgba(54,47,38,0.055)] duration-300"
      data-testid={`card-progress-${props.card.id}`}
      data-state={phase}
    >
      <div className="flex items-center gap-2">
        {phase === "success" ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#4A7C59]" />
        ) : phase === "failed" ? (
          <XCircle className="h-4 w-4 shrink-0 text-[#A3342D]" />
        ) : phase === "waiting" ? (
          <AlertCircle className="h-4 w-4 shrink-0 text-[#9A681B]" />
        ) : (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#66806D]" />
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{props.card.title}</p>
        {props.card.cancelable && job && !TERMINAL.includes(job.status) ? (
          <Button
            size="sm"
            variant="ghost"
            className="rounded-lg text-[#746F67]"
            disabled={canceling || resuming}
            onClick={() => void cancel()}
          >
            <PauseCircle className="h-4 w-4" /> {t("cancel")}
          </Button>
        ) : null}
      </div>

      {job && !TERMINAL.includes(job.status) ? (
        <div className="mt-2.5">
          <Progress value={job.progress} />
          <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-[#746F67]">
            <span>{job.status === "waiting_input" ? t("waitingInput") : locale === "en-US" ? t("queued") : (job.stage ?? t("queued"))}</span>
            <span className="shrink-0 font-mono">{job.progress}%</span>
          </div>
        </div>
      ) : null}

      {inputRequest ? (
        <div className="mt-4 border-t border-[#E6E0D7] pt-4" data-testid="job-input-request">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FFF1D8] text-[#875A16]">
              {inputRequest.kind === "credential" ? <KeyRound className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#292620]">{inputRequest.title}</p>
              <p className="mt-1 text-xs leading-5 text-[#67625A]">{inputRequest.description}</p>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5 text-xs text-[#56514A]">
            {inputRequest.requirements.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#66806D]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {inputRequest.validation ? (
            <section
              className="mt-4 rounded-lg border border-[#E8D4AC] bg-[#FFF9EC] p-3"
              data-testid="job-structured-validation"
            >
              <p className="text-xs font-semibold text-[#72501A]">
                {inputRequest.validation.summary}
              </p>
              <ol className="mt-2 space-y-1.5 text-xs leading-5 text-[#625744]">
                {inputRequest.validation.issues.map((issue, index) => (
                  <li key={`${index}-${issue}`} className="flex items-start gap-2">
                    <span className="mt-0.5 font-mono text-[#9A681B]">{index + 1}.</span>
                    <span className="min-w-0 break-words font-mono">{issue}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {inputRequest.draftOutput ? (
            <section className="mt-4" data-testid="job-unsaved-draft">
              <p className="text-xs font-semibold text-[#4F4A43]">
                {inputRequest.draftLabel}
              </p>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#DED8CF] bg-white p-3 text-xs leading-5 text-[#514C45]">
                {inputRequest.draftOutput}
              </pre>
            </section>
          ) : null}

          {inputRequest.kind === "text" ? (
            <label className="mt-4 block text-xs font-medium text-[#4F4A43]">
              {inputRequest.fieldLabel}
              <Textarea
                className="mt-1.5 min-h-24 resize-y bg-white focus-visible:ring-[#66806D] focus-visible:ring-offset-1"
                value={supplement}
                onChange={(event) => setSupplement(event.target.value)}
                placeholder={inputRequest.placeholder}
                maxLength={2000}
              />
              <span className="mt-1 block text-right font-normal text-[#8A847A]">{supplement.length}/2000</span>
            </label>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {inputRequest.kind === "credential" && waitingReason === "LLM_CREDENTIAL_REQUIRED" ? (
              <Button size="sm" onClick={() => setModelPanelOpen(true)}>
                <LockKeyhole className="h-4 w-4" />
                {locale === "zh-CN" ? "安全配置模型" : "Configure model securely"}
              </Button>
            ) : inputRequest.settingsTarget === "connections" ? (
              <Button size="sm" onClick={props.onOpenConnections}>
                <Settings2 className="h-4 w-4" />
                {locale === "zh-CN" ? "打开连接设置" : "Open connection settings"}
              </Button>
            ) : inputRequest.settingsTarget === "personas" ? (
              <Button size="sm" asChild>
                <Link href="/personas"><Settings2 className="h-4 w-4" />{locale === "zh-CN" ? "打开账号人设" : "Open account personas"}</Link>
              </Button>
            ) : null}

            {inputRequest.kind === "text" ? (
              <Button
                size="sm"
                disabled={(!inputRequest.canRetryWithoutInput && !supplement.trim()) || resuming}
                onClick={() => void resume(supplement || undefined)}
              >
                {resuming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {inputRequest.canRetryWithoutInput && !supplement.trim()
                  ? locale === "zh-CN" ? "按原要求重新生成" : "Regenerate unchanged"
                  : locale === "zh-CN" ? "提交并重新生成" : "Submit and regenerate"}
              </Button>
            ) : inputRequest.kind !== "credential" || waitingReason !== "LLM_CREDENTIAL_REQUIRED" ? (
              <Button size="sm" variant="outline" disabled={resuming} onClick={() => void resume()}>
                {resuming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {locale === "zh-CN" ? "已处理，继续任务" : "Done, continue task"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {job?.status === "failed" ? (
        <p className="mt-2 text-xs text-[#A3342D]">
          {job.messageKey?.startsWith("errors.")
            ? te(job.messageKey.slice("errors.".length) as never)
            : locale === "zh-CN" ? (job.errorMessage ?? t("failed")) : t("failed")}
        </p>
      ) : null}
      {job?.status === "canceled" ? <p className="mt-2 text-xs text-[#746F67]">{t("canceled")}</p> : null}
      {loadError ? <p className="mt-3 text-xs text-[#A3342D]">{loadError}</p> : null}

      <QuickModelSetupPanel
        open={modelPanelOpen}
        onOpenChange={setModelPanelOpen}
        busy={resuming}
        locale={locale}
        onReady={() => resume()}
      />
    </div>
  );
}

function QuickModelSetupPanel(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  locale: string;
  onReady: () => Promise<void>;
}) {
  const [provider, setProvider] = useState<LlmProviderId>("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(LLM_PROVIDER_DEFINITIONS.deepseek.defaultBaseUrl);
  const [model, setModel] = useState(LLM_PROVIDER_DEFINITIONS.deepseek.defaultModel);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zh = props.locale === "zh-CN";

  function selectProvider(value: LlmProviderId) {
    const definition = LLM_PROVIDER_DEFINITIONS[value];
    setProvider(value);
    setBaseUrl(definition.defaultBaseUrl);
    setModel(definition.defaultModel);
    setError(null);
  }

  async function saveAndContinue() {
    if (!apiKey.trim() || !model.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await readApiJson(await fetch("/api/settings/credentials", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          value: { apiKey: apiKey.trim(), baseUrl: baseUrl.trim(), model: model.trim() },
        }),
      }));
      await readApiJson(await fetch("/api/settings/credentials", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      }));
      await readApiJson(await fetch("/api/settings/models/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      }));
      setApiKey("");
      await props.onReady();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (zh ? "模型连接失败" : "Model connection failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(open) => {
      props.onOpenChange(open);
      if (!open) {
        setApiKey("");
        setError(null);
      }
    }}>
      <DialogContent side="right" className="flex max-h-dvh flex-col overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EDF4EE] text-[#476451]">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <DialogTitle className="pt-2">{zh ? "安全配置默认模型" : "Securely configure the default model"}</DialogTitle>
          <DialogDescription className="leading-6">
            {zh ? "API Key 只会发送到加密凭证接口，不会写入会话、任务输出或浏览器缓存。" : "The API key is sent only to the encrypted credential endpoint. It is never written to the conversation, task output, or browser cache."}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 flex flex-1 flex-col gap-5">
          <label className="grid gap-1.5 text-sm font-medium">
            {zh ? "模型服务商" : "Model provider"}
            <Select value={provider} onValueChange={(value) => selectProvider(value as LlmProviderId)}>
              <SelectTrigger className="focus:ring-[#66806D] focus:ring-offset-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LLM_PROVIDER_IDS.map((id) => <SelectItem key={id} value={id}>{LLM_PROVIDER_DEFINITIONS[id].name} · {LLM_PROVIDER_DEFINITIONS[id].company}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            API Key
            <Input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={LLM_PROVIDER_DEFINITIONS[provider].apiKeyPlaceholder}
            />
            <span className="text-xs font-normal leading-5 text-muted-foreground">{zh ? "保存后仅显示末尾提示，不会再次返回原始密钥。" : "After saving, only a masked hint is shown and the original key is never returned."}</span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {zh ? "模型名称" : "Model name"}
            <Input value={model} onChange={(event) => setModel(event.target.value)} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Base URL
            <Input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <div className="rounded-lg bg-[#F4F6F2] p-3 text-xs leading-5 text-[#526057]">
            <p className="font-medium">{zh ? "将自动完成" : "This will automatically"}</p>
            <p className="mt-1">{zh ? "加密保存凭证 · 设为默认模型 · 测试连接 · 继续当前任务" : "Encrypt and save · Set as default · Test connection · Continue the current task"}</p>
          </div>
          {error ? <p className="text-sm text-[#A3342D]">{error}</p> : null}
        </div>

        <DialogFooter className="mt-6">
          <Button
            disabled={!apiKey.trim() || !model.trim() || saving || props.busy}
            onClick={() => void saveAndContinue()}
          >
            {saving || props.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            {zh ? "保存、测试并继续" : "Save, test and continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
