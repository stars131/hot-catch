"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  ExternalLink as ExternalLinkIcon,
  KeyRound as KeyRoundIcon,
  PlugZap as PlugZapIcon,
  Save as SaveIcon,
  Star as StarIcon,
  Trash2 as Trash2Icon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

export type CredentialProviderId =
  | "tikhub"
  | "youtube_data"
  | "x_api"
  | "qwen_asr"
  | "aitoearn"
  | "deepseek"
  | "openai"
  | "grok"
  | "firecrawl"
  | "xiaohongshu_cookie";

export type CredentialSummaryView = {
  provider: CredentialProviderId;
  configured: boolean;
  status: "active" | "invalid" | "revoked" | "missing";
  keyHint: string | null;
  lastValidatedAt: string | null;
  updatedAt: string | null;
  configuration: { baseUrl: string | null; model: string | null } | null;
};

export type CredentialFormValue = {
  apiKey: string;
  baseUrl: string;
  model: string;
  workspaceId: string;
};

export type CredentialProviderCardDefinition = {
  provider: Exclude<CredentialProviderId, "xiaohongshu_cookie">;
  name: string;
  company?: string;
  purpose: string;
  placeholder: string;
  baseUrl?: string;
  model?: string;
  workspaceId?: boolean;
  docsUrl?: string;
  kind: "model" | "integration";
};

type BusyAction = "save" | "remove" | "default" | "test" | null;

type Props = {
  definition: CredentialProviderCardDefinition;
  summary?: CredentialSummaryView;
  form: CredentialFormValue;
  editing: boolean;
  isDefault: boolean;
  busyAction: BusyAction;
  onEdit: () => void;
  onCancel: () => void;
  onChange: (key: keyof CredentialFormValue, value: string) => void;
  onSave: () => void;
  onRemove: () => void;
  onSetDefault: () => void;
  onTest: () => void;
};

export function ProviderCredentialCard({
  definition,
  summary,
  form,
  editing,
  isDefault,
  busyAction,
  onEdit,
  onCancel,
  onChange,
  onSave,
  onRemove,
  onSetDefault,
  onTest,
}: Props) {
  const locale = useLocale();
  const t = useTranslations("Connections");
  const configured = Boolean(summary?.configured);
  const busy = busyAction !== null;
  const showForm = !configured || editing;

  return (
    <Card data-testid={`${definition.kind}-provider-${definition.provider}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <KeyRoundIcon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {definition.name}
                {definition.company ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {definition.company}
                  </span>
                ) : null}
              </CardTitle>
              <CardDescription className="mt-1.5 leading-5">
                {t(`providerPurposes.${definition.provider}`)}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <ConnectionBadge summary={summary} />
            {isDefault ? <Badge variant="secondary">{t("defaultModel")}</Badge> : null}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {showForm ? (
          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel htmlFor={`${definition.provider}-api-key`}>
                API Key
              </FieldLabel>
              <Input
                id={`${definition.provider}-api-key`}
                type="password"
                autoComplete="new-password"
                value={form.apiKey}
                onChange={(event) => onChange("apiKey", event.target.value)}
                placeholder={definition.placeholder}
                required
              />
              <FieldDescription>{t("keyStoredHelp")}</FieldDescription>
            </Field>
            {definition.baseUrl ? (
              <Field>
                <FieldLabel htmlFor={`${definition.provider}-base-url`}>
                  {t("baseUrl")}
                </FieldLabel>
                <Input
                  id={`${definition.provider}-base-url`}
                  type="url"
                  value={form.baseUrl}
                  onChange={(event) => onChange("baseUrl", event.target.value)}
                  placeholder={definition.baseUrl}
                />
              </Field>
            ) : null}
            {definition.model ? (
              <Field>
                <FieldLabel htmlFor={`${definition.provider}-model`}>
                  {t("modelName")}
                </FieldLabel>
                <Input
                  id={`${definition.provider}-model`}
                  value={form.model}
                  onChange={(event) => onChange("model", event.target.value)}
                  placeholder={definition.model}
                  required
                />
                <FieldDescription>
                  {t("modelNameHelp")}
                </FieldDescription>
              </Field>
            ) : null}
            {definition.workspaceId ? (
              <Field>
                <FieldLabel htmlFor={`${definition.provider}-workspace-id`}>
                  {t("workspaceOptional")}
                </FieldLabel>
                <Input
                  id={`${definition.provider}-workspace-id`}
                  value={form.workspaceId}
                  onChange={(event) => onChange("workspaceId", event.target.value)}
                />
              </Field>
            ) : null}
          </FieldGroup>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">{t("savedCredential")}</p>
              <p className="mt-1 font-mono text-sm">
                {summary?.keyHint ?? "••••••••"}
              </p>
              {definition.model ? (
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">{t("model")}</dt>
                    <dd className="mt-0.5 truncate font-mono text-foreground">
                      {summary?.configuration?.model ?? definition.model}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{t("baseUrl")}</dt>
                    <dd className="mt-0.5 truncate font-mono text-foreground">
                      {summary?.configuration?.baseUrl ?? definition.baseUrl}
                    </dd>
                  </div>
                </dl>
              ) : null}
              <p className="mt-3 text-[11px] text-muted-foreground">
                {t("updatedAt", { date: formatDate(summary?.updatedAt, locale) })}
                {summary?.lastValidatedAt
                  ? ` · ${t("lastValidated", { date: formatDate(summary.lastValidatedAt, locale) })}`
                  : ""}
              </p>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-wrap justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {definition.docsUrl ? (
            <Button asChild size="sm" variant="ghost">
              <a href={definition.docsUrl} target="_blank" rel="noreferrer">
                <ExternalLinkIcon data-icon="inline-start" />
                {t("officialDocs")}
              </a>
            </Button>
          ) : null}
          {configured && !showForm ? (
            <Button size="sm" variant="outline" onClick={onEdit} disabled={busy}>
              {t("replaceCredential")}
            </Button>
          ) : null}
          {configured && definition.kind === "model" && !showForm ? (
            <Button size="sm" variant="outline" onClick={onTest} disabled={busy}>
              {busyAction === "test" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <PlugZapIcon data-icon="inline-start" />
              )}
              {t("testConnection")}
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {showForm ? (
            <>
              {configured ? (
                <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
                  {t("cancel")}
                </Button>
              ) : null}
              <Button size="sm" onClick={onSave} disabled={busy}>
                {busyAction === "save" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                {t("encryptedSave")}
              </Button>
            </>
          ) : (
            <>
              {definition.kind === "model" && !isDefault ? (
                <Button size="sm" onClick={onSetDefault} disabled={busy}>
                  {busyAction === "default" ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <StarIcon data-icon="inline-start" />
                  )}
                  {t("setDefault")}
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={onRemove} disabled={busy}>
                {busyAction === "remove" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Trash2Icon data-icon="inline-start" />
                )}
                {t("delete")}
              </Button>
            </>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function ConnectionBadge({ summary }: { summary?: CredentialSummaryView }) {
  const t = useTranslations("Connections");
  if (!summary?.configured) return <Badge variant="outline">{t("notConfigured")}</Badge>;
  if (summary.status === "active") return <Badge variant="secondary">{t("connected")}</Badge>;
  return (
    <Badge variant="destructive">
      {summary.status === "invalid" ? t("credentialInvalid") : t("revoked")}
    </Badge>
  );
}

function formatDate(value: string | null | undefined, locale: string) {
  return value ? new Date(value).toLocaleString(locale) : "—";
}
