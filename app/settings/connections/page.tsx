"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  ExternalLink as ExternalLinkIcon,
  Link2 as Link2Icon,
  Puzzle as PuzzleIcon,
  ShieldCheck as ShieldCheckIcon,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import {
  type CredentialFormValue,
  type CredentialProviderCardDefinition,
  type CredentialSummaryView,
  ProviderCredentialCard,
} from "@/components/settings/provider-credential-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { readApiJson } from "@/lib/api-client";
import {
  LLM_PROVIDER_DEFINITIONS,
  type LlmProviderId,
} from "@/lib/providers/llm-config";

type AiToEarnStatus = {
  connection: "connected" | "invalid" | "not_configured";
  keyHint: string | null;
  metadata: {
    platforms: Array<{ platform: string; displayName: string; notes?: string }>;
  };
};

type PublishAccount = {
  id: string;
  platform: string;
  name: string;
  status: "active" | "expired" | "invalid";
};

type CredentialSettingsResponse = {
  credentials: CredentialSummaryView[];
  defaultLlmProvider: LlmProviderId | null;
};

type ConfigurableProviderId = CredentialProviderCardDefinition["provider"];

type BusyState = {
  provider: ConfigurableProviderId;
  action: "save" | "remove" | "default" | "test";
} | null;

const MODEL_PROVIDER_ORDER: LlmProviderId[] = ["openai", "grok", "deepseek"];
const EMPTY_CREDENTIALS: CredentialSummaryView[] = [];

const MODEL_PROVIDERS: CredentialProviderCardDefinition[] = MODEL_PROVIDER_ORDER.map(
  (provider) => {
    const definition = LLM_PROVIDER_DEFINITIONS[provider];
    return {
      provider,
      name: definition.name,
      company: definition.company,
      purpose: definition.purpose,
      placeholder: definition.apiKeyPlaceholder,
      baseUrl: definition.defaultBaseUrl,
      model: definition.defaultModel,
      docsUrl: definition.docsUrl,
      kind: "model",
    };
  },
);

const INTEGRATION_PROVIDERS: CredentialProviderCardDefinition[] = [
  {
    provider: "youtube_data",
    name: "YouTube Data API",
    purpose: "YouTube 历史视频公开指标同步",
    placeholder: "AIza...",
    docsUrl: "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    kind: "integration",
  },
  {
    provider: "x_api",
    name: "X API",
    purpose: "可选：优先使用 X 官方接口；未配置时自动使用公开 OSINT 数据源",
    placeholder: "X API Bearer Token",
    docsUrl: "https://docs.x.com/x-api/overview",
    kind: "integration",
  },
  {
    provider: "tikhub",
    name: "TikHub",
    purpose: "小红书与抖音公开或授权账号、作品和指标解析",
    placeholder: "TikHub API Key",
    kind: "integration",
  },
  {
    provider: "qwen_asr",
    name: "Qwen-ASR",
    purpose: "抖音视频语音转写",
    placeholder: "DashScope API Key",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    workspaceId: true,
    kind: "integration",
  },
  {
    provider: "aitoearn",
    name: "AiToEarn",
    purpose: "平台授权、素材上传、发布与记录回收",
    placeholder: "AiToEarn API Key",
    baseUrl: "https://open-api.aitoearn.cn",
    kind: "integration",
  },
  {
    provider: "firecrawl",
    name: "Firecrawl",
    purpose: "可选：导入普通网页资料",
    placeholder: "fc-...",
    baseUrl: "https://api.firecrawl.dev",
    kind: "integration",
  },
];

const PROVIDER_BY_ID = new Map(
  [...MODEL_PROVIDERS, ...INTEGRATION_PROVIDERS].map((item) => [
    item.provider,
    item,
  ]),
);

export default function ConnectionsPage() {
  const locale = useLocale();
  const t = useTranslations("Connections");
  const [editing, setEditing] = useState<ConfigurableProviderId | null>(null);
  const [busyState, setBusyState] = useState<BusyState>(null);
  const [forms, setForms] = useState<
    Partial<Record<ConfigurableProviderId, CredentialFormValue>>
  >({});
  const [authBusy, setAuthBusy] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<PublishAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const credentialsQuery = useQuery({
    queryKey: ["workspace", "credential-summaries"],
    queryFn: async () => readApiJson<CredentialSettingsResponse>(
      await fetch("/api/settings/credentials", { cache: "no-store" }),
    ),
    staleTime: 2 * 60 * 1000,
  });
  const aiStatusQuery = useQuery({
    queryKey: ["workspace", "aitoearn-status"],
    queryFn: async () => readApiJson<AiToEarnStatus>(
      await fetch("/api/integrations/aitoearn/status", { cache: "no-store" }),
    ),
    staleTime: 60 * 1000,
    retry: false,
  });
  const summaries = credentialsQuery.data?.credentials ?? EMPTY_CREDENTIALS;
  const defaultLlmProvider = credentialsQuery.data?.defaultLlmProvider ?? null;
  const aiStatus = aiStatusQuery.data ?? null;
  const loading = credentialsQuery.isPending;

  const summaryMap = useMemo(
    () => new Map(summaries.map((item) => [item.provider, item])),
    [summaries],
  );

  const load = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace", "credential-summaries"] }),
      queryClient.invalidateQueries({ queryKey: ["workspace", "aitoearn-status"] }),
    ]);
  }, [queryClient]);

  useEffect(() => {
    if (credentialsQuery.error) {
      toast.error(localizedConnectionError(credentialsQuery.error, locale, t("loadFailed")));
    }
  }, [credentialsQuery.error, locale, t]);

  function formFor(provider: ConfigurableProviderId) {
    return forms[provider] ?? createInitialForm(PROVIDER_BY_ID.get(provider));
  }

  function updateForm(
    provider: ConfigurableProviderId,
    key: keyof CredentialFormValue,
    value: string,
  ) {
    setForms((current) => ({
      ...current,
      [provider]: {
        ...(current[provider] ??
          createInitialForm(PROVIDER_BY_ID.get(provider))),
        [key]: value,
      },
    }));
  }

  function startEditing(provider: ConfigurableProviderId) {
    const definition = PROVIDER_BY_ID.get(provider);
    const summary = summaryMap.get(provider);
    setForms((current) => ({
      ...current,
      [provider]: {
        apiKey: "",
        baseUrl:
          summary?.configuration?.baseUrl ?? definition?.baseUrl ?? "",
        model: summary?.configuration?.model ?? definition?.model ?? "",
        workspaceId: "",
      },
    }));
    setEditing(provider);
  }

  async function save(provider: ConfigurableProviderId) {
    const definition = PROVIDER_BY_ID.get(provider);
    const form = formFor(provider);
    if (!form.apiKey.trim()) {
      toast.error(t("apiKeyRequired"));
      return;
    }
    if (definition?.kind === "model" && !form.model.trim()) {
      toast.error(t("modelRequired"));
      return;
    }
    const value = Object.fromEntries(
      Object.entries(form).filter(([, entry]) => entry.trim()),
    );
    setBusyState({ provider, action: "save" });
    try {
      await readApiJson(
        await fetch("/api/settings/credentials", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider, value }),
        }),
      );
      setForms((current) => ({
        ...current,
        [provider]: createInitialForm(definition),
      }));
      setEditing(null);
      toast.success(t("savedToast", { provider: definition?.name ?? provider }));
      await load();
      if (provider === "aitoearn") {
        toast.message(t("authorizeNext"), {
          description: t("authorizeNextHelp"),
        });
      }
    } catch (cause) {
      toast.error(localizedConnectionError(cause, locale, t("saveFailed")));
    } finally {
      setBusyState(null);
    }
  }

  async function remove(provider: ConfigurableProviderId) {
    setBusyState({ provider, action: "remove" });
    try {
      await readApiJson(
        await fetch(`/api/settings/credentials?provider=${provider}`, {
          method: "DELETE",
        }),
      );
      setEditing(null);
      toast.success(t("deletedToast"));
      await load();
    } catch (cause) {
      toast.error(localizedConnectionError(cause, locale, t("deleteFailed")));
    } finally {
      setBusyState(null);
    }
  }

  async function setAsDefault(provider: LlmProviderId) {
    setBusyState({ provider, action: "default" });
    try {
      const data = await readApiJson<{ defaultLlmProvider: LlmProviderId }>(
        await fetch("/api/settings/credentials", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider }),
        }),
      );
      queryClient.setQueryData<CredentialSettingsResponse>(["workspace", "credential-summaries"], (current) => ({
        credentials: current?.credentials ?? summaries,
        defaultLlmProvider: data.defaultLlmProvider,
      }));
      toast.success(t("defaultToast", { provider: LLM_PROVIDER_DEFINITIONS[provider].name }));
    } catch (cause) {
      toast.error(localizedConnectionError(cause, locale, t("defaultFailed")));
    } finally {
      setBusyState(null);
    }
  }

  async function testModel(provider: LlmProviderId) {
    setBusyState({ provider, action: "test" });
    try {
      const data = await readApiJson<{ model: string }>(
        await fetch("/api/settings/models/test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider }),
        }),
      );
      toast.success(t("testSuccess"), { description: t("testModel", { model: data.model }) });
      await load();
    } catch (cause) {
      toast.error(localizedConnectionError(cause, locale, t("testFailed")));
    } finally {
      setBusyState(null);
    }
  }

  async function authorize(platform: "xiaohongshu" | "douyin") {
    setAuthBusy(platform);
    try {
      const data = await readApiJson<{
        authorizationUrl: string;
        sessionId: string;
      }>(
        await fetch("/api/integrations/aitoearn/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ platform }),
        }),
      );
      sessionStorage.setItem(`aitoearn-auth-${platform}`, data.sessionId);
      window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
      toast.success(t("authOpened"), {
        description: t("authOpenedHelp"),
      });
    } catch (cause) {
      toast.error(localizedConnectionError(cause, locale, t("authFailed")));
    } finally {
      setAuthBusy(null);
    }
  }

  async function checkAccounts() {
    setAuthBusy("accounts");
    setAccountsError(null);
    try {
      const data = await readApiJson<{ accounts: PublishAccount[] }>(
        await fetch("/api/integrations/aitoearn/accounts", {
          cache: "no-store",
        }),
      );
      setAccounts(data.accounts);
      if (data.accounts.length) {
        toast.success(t("accountsSynced", { count: data.accounts.length }));
      } else {
        toast.message(t("noAccountsSynced"));
      }
    } catch (cause) {
      setAccounts(null);
      setAccountsError(
        localizedConnectionError(cause, locale, t("accountsFailed")),
      );
      toast.error(localizedConnectionError(cause, locale, t("accountsFailed")));
    } finally {
      setAuthBusy(null);
    }
  }

  return (
    <AppShell
      title={t("title")}
      description={t("description")}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/skills">
            <PuzzleIcon data-icon="inline-start" />
            {t("skillSettings")}
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-8">
        <Alert>
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>{t("encryptionTitle")}</AlertTitle>
          <AlertDescription>{t("encryptionBody")}</AlertDescription>
        </Alert>

        <ProviderSection
          title={t("modelsTitle")}
          description={t("modelsDescription")}
        >
          {loading ? (
            <ProviderGridSkeleton count={3} />
          ) : (
            <div className="grid gap-4 xl:grid-cols-3">
              {MODEL_PROVIDERS.map((definition) => (
                <ProviderCredentialCard
                  key={definition.provider}
                  definition={definition}
                  summary={summaryMap.get(definition.provider)}
                  form={formFor(definition.provider)}
                  editing={editing === definition.provider}
                  isDefault={defaultLlmProvider === definition.provider}
                  busyAction={
                    busyState?.provider === definition.provider
                      ? busyState.action
                      : null
                  }
                  onEdit={() => startEditing(definition.provider)}
                  onCancel={() => setEditing(null)}
                  onChange={(key, value) =>
                    updateForm(definition.provider, key, value)
                  }
                  onSave={() => void save(definition.provider)}
                  onRemove={() => void remove(definition.provider)}
                  onSetDefault={() =>
                    void setAsDefault(definition.provider as LlmProviderId)
                  }
                  onTest={() =>
                    void testModel(definition.provider as LlmProviderId)
                  }
                />
              ))}
            </div>
          )}
        </ProviderSection>

        <ProviderSection
          title={t("integrationsTitle")}
          description={t("integrationsDescription")}
        >
          {loading ? (
            <ProviderGridSkeleton count={4} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {INTEGRATION_PROVIDERS.map((definition) => (
                <ProviderCredentialCard
                  key={definition.provider}
                  definition={definition}
                  summary={summaryMap.get(definition.provider)}
                  form={formFor(definition.provider)}
                  editing={editing === definition.provider}
                  isDefault={false}
                  busyAction={
                    busyState?.provider === definition.provider
                      ? busyState.action
                      : null
                  }
                  onEdit={() => startEditing(definition.provider)}
                  onCancel={() => setEditing(null)}
                  onChange={(key, value) =>
                    updateForm(definition.provider, key, value)
                  }
                  onSave={() => void save(definition.provider)}
                  onRemove={() => void remove(definition.provider)}
                  onSetDefault={() => undefined}
                  onTest={() => undefined}
                />
              ))}
            </div>
          )}
        </ProviderSection>

        <PublishingConnectionPanel
          loading={loading}
          summary={summaryMap.get("aitoearn")}
          status={aiStatus}
          accounts={accounts}
          accountsError={accountsError}
          busy={authBusy}
          onAuthorize={authorize}
          onCheckAccounts={checkAccounts}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("xhsCookieTitle")}</CardTitle>
            <CardDescription>{t("xhsCookieDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{t("xhsCookieBody")}</p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ProviderSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${title}-heading`}>
      <div>
        <h2 id={`${title}-heading`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ProviderGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardHeader className="flex flex-row items-start gap-3">
            <Skeleton className="size-9" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PublishingConnectionPanel({
  loading,
  summary,
  status,
  accounts,
  accountsError,
  busy,
  onAuthorize,
  onCheckAccounts,
}: {
  loading: boolean;
  summary?: CredentialSummaryView;
  status: AiToEarnStatus | null;
  accounts: PublishAccount[] | null;
  accountsError: string | null;
  busy: string | null;
  onAuthorize: (platform: "xiaohongshu" | "douyin") => Promise<void>;
  onCheckAccounts: () => Promise<void>;
}) {
  const t = useTranslations("Connections");
  const connection = status?.connection;
  const notConfigured =
    connection === "not_configured" || (!loading && !summary?.configured);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{t("publishAuthTitle")}</CardTitle>
            <CardDescription className="mt-1.5">{t("publishAuthDescription")}</CardDescription>
          </div>
          <AiToEarnConnectionBadge connection={connection} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notConfigured ? (
          <Alert data-testid="aitoearn-not-configured">
            <AlertTitle>{t("publishNotConfiguredTitle")}</AlertTitle>
            <AlertDescription>{t("publishNotConfiguredBody")}</AlertDescription>
          </Alert>
        ) : connection === "invalid" ? (
          <Alert variant="destructive" data-testid="aitoearn-invalid">
            <AlertTitle>{t("publishInvalidTitle")}</AlertTitle>
            <AlertDescription>{t("publishInvalidBody")}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => void onAuthorize("xiaohongshu")}
            disabled={connection !== "connected" || busy !== null}
          >
            {busy === "xiaohongshu" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ExternalLinkIcon data-icon="inline-start" />
            )}
            {t("authorizeXhs")}
          </Button>
          <Button
            variant="outline"
            onClick={() => void onAuthorize("douyin")}
            disabled={connection !== "connected" || busy !== null}
          >
            {busy === "douyin" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ExternalLinkIcon data-icon="inline-start" />
            )}
            {t("authorizeDouyin")}
          </Button>
          <Button
            onClick={() => void onCheckAccounts()}
            disabled={connection !== "connected" || busy !== null}
          >
            {busy === "accounts" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Link2Icon data-icon="inline-start" />
            )}
            {t("syncAccounts")}
          </Button>
        </div>

        <div data-testid="aitoearn-accounts">
          <p className="text-sm font-medium">{t("authorizedAccounts")}</p>
          {accountsError ? (
            <p className="mt-2 text-sm text-destructive">{accountsError}</p>
          ) : accounts === null ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {connection === "connected"
                ? t("authorizedAccountsConnectedHelp")
                : t("authorizedAccountsHelp")}
            </p>
          ) : accounts.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("authorizedAccountsEmpty")}
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {accounts.map((account) => (
                <li
                  key={account.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {account.name}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {account.platform === "douyin" ? t("douyin") : t("xiaohongshu")}
                    </span>
                  </span>
                  <Badge
                    variant={account.status === "active" ? "secondary" : "destructive"}
                  >
                    {account.status === "active" ? t("active") : t("expired")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        {status ? (
          <Alert>
            <AlertTitle>{t("publishRulesTitle")}</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc pl-4">
                {status.metadata.platforms.map((rules) => (
                  <li key={rules.platform}>
                    {rules.displayName}：{rules.notes ?? ""}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AiToEarnConnectionBadge({
  connection,
}: {
  connection?: AiToEarnStatus["connection"];
}) {
  const t = useTranslations("Connections");
  if (connection === "connected") {
    return (
      <Badge variant="secondary" data-testid="aitoearn-connection-badge">
        {t("connected")}
      </Badge>
    );
  }
  if (connection === "invalid") {
    return (
      <Badge variant="destructive" data-testid="aitoearn-connection-badge">
        {t("credentialInvalid")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" data-testid="aitoearn-connection-badge">
      {t("notConfigured")}
    </Badge>
  );
}

function createInitialForm(
  definition?: CredentialProviderCardDefinition,
): CredentialFormValue {
  return {
    apiKey: "",
    baseUrl: definition?.baseUrl ?? "",
    model: definition?.model ?? "",
    workspaceId: "",
  };
}

function localizedConnectionError(error: unknown, locale: string, fallback: string) {
  if (locale === "zh-CN" && error instanceof Error) return error.message;
  return fallback;
}
