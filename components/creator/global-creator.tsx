"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  FilePenLine,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import {
  CONTENT_LOCALES,
  GLOBAL_PLATFORM_IDS,
  PLATFORM_DEFINITIONS,
  PLATFORM_IDS,
  type ContentLocale,
  type PlatformId,
} from "@/lib/platforms/registry";
import type { SkillCatalogItem } from "@/lib/skills/catalog";
import { cn } from "@/lib/utils";

type BatchItem = {
  platform: PlatformId;
  contentId: string;
  jobId: string | null;
  status: string;
  progress?: number;
  stage?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  messageKey?: string | null;
};

type ContentView = {
  id: string;
  platform: PlatformId;
  title: string | null;
  bodyText: string | null;
  fullMarkdown: string | null;
  revisions: Array<{
    id: string;
    revisionNumber: number;
    title: string | null;
    bodyText: string | null;
    fullMarkdown: string | null;
    structuredContent: unknown;
  }>;
};

const TERMINAL_JOB_STATUSES = new Set(["succeeded", "failed", "canceled", "waiting_input"]);

export function GlobalCreator({ foreignEnabled }: { foreignEnabled: boolean }) {
  const locale = useLocale();
  const t = useTranslations("Creator");
  const tp = useTranslations("Platforms");
  const tl = useTranslations("ContentLocales");
  const te = useTranslations("Errors");
  const tb = useTranslations("BuiltinSkills");
  const [brief, setBrief] = useState("");
  const [targetLocale, setTargetLocale] = useState<ContentLocale>(
    foreignEnabled ? "en-US" : "zh-CN",
  );
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>([
    foreignEnabled ? "youtube" : "xiaohongshu",
  ]);
  const [skills, setSkills] = useState<SkillCatalogItem[]>([]);
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [editor, setEditor] = useState<ContentView | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/skills", { cache: "no-store" })
      .then((response) => readApiJson<{ skills: SkillCatalogItem[] }>(response))
      .then((data) => setSkills(data.skills.filter((skill) => skill.enabled)))
      .catch((error) =>
        toast.error(localizedError(error, locale, te, t("errors.loadSkills"))),
      );
  }, [locale, t, te]);

  useEffect(() => {
    if (!runId || !items.some((item) => !TERMINAL_JOB_STATUSES.has(item.status))) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const data = await readApiJson<{
          run: {
            input: { targetPlatforms?: PlatformId[] };
            jobs: Array<{
              id: string;
              status: string;
              progress: number;
              stage: string | null;
              errorCode: string | null;
              errorMessage: string | null;
              messageKey: string | null;
              input: { contentId?: string };
            }>;
          };
        }>(await fetch(`/api/agent-runs/${runId}`, { cache: "no-store" }));
        if (stopped) return;
        setItems((current) =>
          current.map((item) => {
            const matching = [...data.run.jobs]
              .reverse()
              .find((job) => job.input?.contentId === item.contentId);
            return matching
              ? {
                  ...item,
                  jobId: matching.id,
                  status: matching.status,
                  progress: matching.progress,
                  stage: matching.stage,
                  errorCode: matching.errorCode,
                  errorMessage: matching.errorMessage,
                  messageKey: matching.messageKey,
                }
              : item;
          }),
        );
      } catch {
        // The next interval retries; individual jobs retain their last known state.
      }
    }, 1800);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [items, runId]);

  const generationSkills = useMemo(
    () => skills.filter((skill) => skill.scopes.includes("generation")),
    [skills],
  );
  const globalPlatforms = GLOBAL_PLATFORM_IDS;
  const domesticPlatforms = PLATFORM_IDS.filter(
    (platform) => PLATFORM_DEFINITIONS[platform].group === "domestic",
  );

  function togglePlatform(platform: PlatformId) {
    setSelectedPlatforms((current) => {
      if (current.includes(platform)) {
        return current.length === 1 ? current : current.filter((item) => item !== platform);
      }
      return current.length >= 5 ? current : [...current, platform];
    });
  }

  function toggleSkill(skillId: string) {
    setSelectedSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((id) => id !== skillId)
        : current.length >= 8
          ? current
          : [...current, skillId],
    );
  }

  async function generate() {
    if (!brief.trim()) return toast.error(t("errors.briefRequired"));
    if (!selectedPlatforms.length) return toast.error(t("errors.platformRequired"));
    setSubmitting(true);
    try {
      let activeConversationId = conversationId;
      if (!activeConversationId) {
        const conversation = await readApiJson<{ conversation: { id: string } }>(
          await fetch("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: brief.trim().slice(0, 48) }),
          }),
        );
        activeConversationId = conversation.conversation.id;
        setConversationId(activeConversationId);
      }
      const batch = await readApiJson<{
        runId: string;
        items: BatchItem[];
      }>(
        await fetch(`/api/conversations/${activeConversationId}/generation-batches`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({
            brief: brief.trim(),
            targetPlatforms: selectedPlatforms,
            targetLocale,
            skillIds: selectedSkillIds,
          }),
        }),
      );
      setRunId(batch.runId);
      setItems(batch.items);
    } catch (error) {
      toast.error(localizedError(error, locale, te, t("errors.createBatch")));
    } finally {
      setSubmitting(false);
    }
  }

  async function retryItem(item: BatchItem) {
    if (!runId) return;
    try {
      const result = await readApiJson<{ jobId: string; status: string }>(
        await fetch(`/api/agent-runs/${runId}/items/${item.contentId}/retry`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        }),
      );
      setItems((current) =>
        current.map((candidate) =>
          candidate.contentId === item.contentId
            ? { ...candidate, jobId: result.jobId, status: result.status, progress: 0 }
            : candidate,
        ),
      );
    } catch (error) {
      toast.error(localizedError(error, locale, te, t("errors.createBatch")));
    }
  }

  async function openEditor(item: BatchItem) {
    try {
      const data = await readApiJson<{ content: ContentView }>(
        await fetch(`/api/content/${item.contentId}`, { cache: "no-store" }),
      );
      const latest = data.content.revisions[0];
      setEditor(data.content);
      setDraftTitle(latest?.title ?? data.content.title ?? "");
      setDraftMarkdown(
        latest?.fullMarkdown ?? latest?.bodyText ?? data.content.fullMarkdown ?? data.content.bodyText ?? "",
      );
    } catch (error) {
      toast.error(localizedError(error, locale, te, t("errors.createBatch")));
    }
  }

  async function saveEditor() {
    if (!editor) return;
    setSaving(true);
    try {
      const latest = editor.revisions[0];
      await readApiJson(
        await fetch(`/api/content/${editor.id}/revisions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "manual",
            title: draftTitle,
            bodyText: draftMarkdown,
            fullMarkdown: draftMarkdown,
            structuredContent: latest?.structuredContent,
          }),
        }),
      );
      toast.success(t("saved"));
      setEditor(null);
    } catch (error) {
      toast.error(localizedError(error, locale, te, t("errors.createBatch")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      eyebrow={t("eyebrow")}
      title={t("title")}
      description={t("description")}
      contentClassName="mx-auto max-w-7xl"
    >
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,.95fr)]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-lg">{t("platforms")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-7">
            <PlatformGroup
              title={t("domestic")}
              platforms={domesticPlatforms}
              selected={selectedPlatforms}
              disabled={false}
              locale={locale}
              labelFor={(platform) => tp(platform)}
              onToggle={togglePlatform}
            />
            <PlatformGroup
              title={t("global")}
              platforms={globalPlatforms}
              selected={selectedPlatforms}
              disabled={!foreignEnabled}
              locale={locale}
              labelFor={(platform) => tp(platform)}
              onToggle={togglePlatform}
            />
            {!foreignEnabled ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {t("foreignDisabled")}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <Label htmlFor="target-locale">{t("targetLanguage")}</Label>
              <Select value={targetLocale} onValueChange={(value) => setTargetLocale(value as ContentLocale)}>
                <SelectTrigger id="target-locale">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_LOCALES.map((contentLocale) => (
                    <SelectItem key={contentLocale} value={contentLocale}>
                      {tl(contentLocale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs leading-5 text-muted-foreground">{t("targetLanguageHelp")}</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="creation-brief">{t("brief")}</Label>
              <Textarea
                id="creation-brief"
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
                placeholder={t("briefPlaceholder")}
                className="min-h-44 resize-y leading-6"
                maxLength={12000}
              />
            </div>
            <fieldset className="flex flex-col gap-3">
              <legend className="text-sm font-medium">{t("skills")}</legend>
              {generationSkills.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {generationSkills.map((skill) => {
                    const checked = selectedSkillIds.includes(skill.id);
                    const display = localizeSkill(skill, locale, tb);
                    return (
                      <label
                        key={skill.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                          checked && "border-primary bg-primary/5",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSkill(skill.id)}
                          aria-label={display.name}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">{display.name}</span>
                          <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                            {display.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noSkills")}</p>
              )}
            </fieldset>
            <Button size="lg" onClick={() => void generate()} disabled={submitting}>
              {submitting ? (
                <Loader2 data-icon="inline-start" className="animate-spin" />
              ) : (
                <Sparkles data-icon="inline-start" />
              )}
              {submitting ? t("generating") : t("generate")}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-lg">{t("batchTitle")}</CardTitle>
              <CardDescription className="mt-1">
                {runId ? t("downloadReady") : t("emptyBatch")}
              </CardDescription>
            </div>
            {runId ? (
              <Button asChild size="sm" variant="outline">
                <a href={`/api/agent-runs/${runId}/export`}>
                  <Download data-icon="inline-start" />
                  {t("download")}
                </a>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {items.length ? (
              <div className="flex flex-col gap-3">
                {items.map((item) => (
                  <BatchItemCard
                    key={item.contentId}
                    item={item}
                    platformLabel={tp(item.platform)}
                    statusLabel={t(`status.${item.status}` as Parameters<typeof t>[0])}
                    stageLabel={locale === "en-US" ? undefined : item.stage}
                    errorLabel={localizedJobError(item, locale, te)}
                    manualPublishLabel={t("manualPublish")}
                    openLabel={t("openEditor")}
                    retryLabel={t("retryPlatform")}
                    onOpen={() => void openEditor(item)}
                    onRetry={() => void retryItem(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="grid min-h-72 place-items-center rounded-lg border border-dashed bg-muted/20 p-8 text-center">
                <div>
                  <FilePenLine className="mx-auto size-6 text-muted-foreground" />
                  <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
                    {t("emptyBatch")}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("editorTitle")}</DialogTitle>
            <DialogDescription>{t("editHelp")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5 py-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="artifact-title">{editor ? tp(editor.platform) : ""}</Label>
              <input
                id="artifact-title"
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="artifact-markdown">{t("markdown")}</Label>
              <Textarea
                id="artifact-markdown"
                value={draftMarkdown}
                onChange={(event) => setDraftMarkdown(event.target.value)}
                className="min-h-[45dvh] font-mono text-xs leading-6"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void saveEditor()} disabled={saving}>
              {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              {saving ? t("saving") : t("saveVersion")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function PlatformGroup(props: {
  title: string;
  platforms: readonly PlatformId[];
  selected: PlatformId[];
  disabled: boolean;
  locale: string;
  labelFor: (platform: PlatformId) => string;
  onToggle: (platform: PlatformId) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3" disabled={props.disabled}>
      <legend className="text-sm font-medium">{props.title}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {props.platforms.map((platform) => {
          const definition = PLATFORM_DEFINITIONS[platform];
          const checked = props.selected.includes(platform);
          return (
            <label
              key={platform}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                checked && "border-primary bg-primary/5",
                props.disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => props.onToggle(platform)}
                disabled={props.disabled}
                aria-label={props.labelFor(platform)}
              />
              <span>
                <span className="block text-sm font-medium">{props.labelFor(platform)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {props.locale === "en-US" ? definition.formatNameEn : definition.formatName}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function BatchItemCard(props: {
  item: BatchItem;
  platformLabel: string;
  statusLabel: string;
  stageLabel?: string | null;
  errorLabel?: string | null;
  manualPublishLabel: string;
  openLabel: string;
  retryLabel: string;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const progress = props.item.status === "succeeded" ? 100 : (props.item.progress ?? 0);
  const canOpen = props.item.status === "succeeded";
  const canRetry = ["failed", "waiting_input", "canceled"].includes(props.item.status);
  return (
    <div
      className="rounded-lg border bg-background p-4"
      data-testid={`batch-item-${props.item.platform}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {canOpen ? (
              <CheckCircle2 className="size-4 text-emerald-600" />
            ) : props.item.status === "running" || props.item.status === "queued" ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : (
              <RefreshCw className="size-4 text-muted-foreground" />
            )}
            <p className="font-medium">{props.platformLabel}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {props.stageLabel || props.statusLabel || props.manualPublishLabel}
          </p>
        </div>
        <Badge variant={props.item.status === "failed" ? "destructive" : "outline"}>
          {props.statusLabel}
        </Badge>
      </div>
      <Progress value={progress} className="mt-3 h-1.5" />
      {props.errorLabel ? (
        <p className="mt-2 text-xs leading-5 text-destructive">{props.errorLabel}</p>
      ) : null}
      {canOpen || canRetry ? (
        <div className="mt-3 flex gap-2">
          {canOpen ? (
            <Button size="sm" variant="outline" onClick={props.onOpen}>
              <FilePenLine data-icon="inline-start" />
              {props.openLabel}
            </Button>
          ) : null}
          {canRetry ? (
            <Button size="sm" variant="outline" onClick={props.onRetry}>
              <RefreshCw data-icon="inline-start" />
              {props.retryLabel}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function localizedJobError(
  item: Pick<BatchItem, "messageKey" | "errorMessage">,
  locale: string,
  translate: (key: never) => string,
) {
  if (item.messageKey?.startsWith("errors.")) {
    return translate(item.messageKey.slice("errors.".length) as never);
  }
  if (locale === "zh-CN" && item.errorMessage) return item.errorMessage;
  return item.errorMessage ? translate("jobFailed" as never) : null;
}

function localizedError(
  error: unknown,
  locale: string,
  translate: (key: never) => string,
  fallback: string,
) {
  const messageKey =
    error && typeof error === "object" && "messageKey" in error
      ? (error as { messageKey?: unknown }).messageKey
      : null;
  if (typeof messageKey === "string" && messageKey.startsWith("errors.")) {
    return translate(messageKey.slice("errors.".length) as never);
  }
  if (locale === "zh-CN" && error instanceof Error) return error.message;
  return fallback;
}

function localizeSkill(
  skill: SkillCatalogItem,
  locale: string,
  translate: (key: never) => string,
) {
  if (locale !== "en-US" || skill.source !== "builtin") {
    return { name: skill.name, description: skill.description };
  }
  const keys: Record<string, [string, string]> = {
    "builtin.rewrite-section": ["rewriteName", "rewriteDescription"],
    "builtin.expand-hook": ["hookName", "hookDescription"],
    "builtin.compress-text": ["compressName", "compressDescription"],
    "builtin.improve-visual": ["visualName", "visualDescription"],
    "builtin.risk-check": ["riskName", "riskDescription"],
  };
  const pair = keys[skill.id];
  return pair
    ? { name: translate(pair[0] as never), description: translate(pair[1] as never) }
    : { name: skill.name, description: skill.description };
}
