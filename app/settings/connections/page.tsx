"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [summaries, setSummaries] = useState<CredentialSummaryView[]>([]);
  const [defaultLlmProvider, setDefaultLlmProvider] =
    useState<LlmProviderId | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ConfigurableProviderId | null>(null);
  const [busyState, setBusyState] = useState<BusyState>(null);
  const [forms, setForms] = useState<
    Partial<Record<ConfigurableProviderId, CredentialFormValue>>
  >({});
  const [authBusy, setAuthBusy] = useState<string | null>(null);
  const [aiStatus, setAiStatus] = useState<AiToEarnStatus | null>(null);
  const [accounts, setAccounts] = useState<PublishAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const summaryMap = useMemo(
    () => new Map(summaries.map((item) => [item.provider, item])),
    [summaries],
  );

  const load = useCallback(async () => {
    const [credentialsResult, aiStatusResult] = await Promise.allSettled([
      fetch("/api/settings/credentials", { cache: "no-store" }).then(
        readApiJson<CredentialSettingsResponse>,
      ),
      fetch("/api/integrations/aitoearn/status", { cache: "no-store" }).then(
        readApiJson<AiToEarnStatus>,
      ),
    ]);

    if (credentialsResult.status === "fulfilled") {
      setSummaries(credentialsResult.value.credentials);
      setDefaultLlmProvider(credentialsResult.value.defaultLlmProvider);
    } else {
      toast.error(
        credentialsResult.reason instanceof Error
          ? credentialsResult.reason.message
          : "连接状态加载失败",
      );
    }
    setAiStatus(
      aiStatusResult.status === "fulfilled" ? aiStatusResult.value : null,
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      toast.error("请填写 API Key");
      return;
    }
    if (definition?.kind === "model" && !form.model.trim()) {
      toast.error("请填写模型名称");
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
      toast.success(`${definition?.name ?? provider} 已加密保存`);
      await load();
      if (provider === "aitoearn") {
        toast.message("下一步授权发布账号", {
          description: "API Key 保存后，还需要分别授权小红书和抖音账号。",
        });
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "保存失败");
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
      toast.success("凭证已删除");
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "删除失败");
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
      setDefaultLlmProvider(data.defaultLlmProvider);
      toast.success(`${LLM_PROVIDER_DEFINITIONS[provider].name} 已设为默认模型`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "设置失败");
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
      toast.success("连接正常", { description: `模型：${data.model}` });
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "连接测试失败");
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
      toast.success("授权页已打开", {
        description: "完成授权后回到这里检查账号状态。",
      });
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "无法开始授权");
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
        toast.success(`已同步 ${data.accounts.length} 个账号`);
      } else {
        toast.message("暂未同步到发布账号");
      }
    } catch (cause) {
      setAccounts(null);
      setAccountsError(
        cause instanceof Error ? cause.message : "账号同步失败",
      );
      toast.error(cause instanceof Error ? cause.message : "账号同步失败");
    } finally {
      setAuthBusy(null);
    }
  }

  return (
    <AppShell
      title="连接设置"
      description="配置默认生成模型，以及数据、转写和发布服务。"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/settings/skills">
            <PuzzleIcon data-icon="inline-start" />
            Skill 设置
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-8">
        <Alert>
          <ShieldCheckIcon aria-hidden="true" />
          <AlertTitle>凭证使用 AES-256-GCM 加密存储</AlertTitle>
          <AlertDescription>
            浏览器、API 响应和应用日志不会返回 Key 原文。生产部署前必须单独配置
            CREDENTIAL_ENCRYPTION_KEY。
          </AlertDescription>
        </Alert>

        <ProviderSection
          title="模型配置"
          description="ChatGPT、Grok 和 DeepSeek 共用统一生成接口；只有标记为“默认模型”的配置会用于新任务。"
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
          title="数据与发布连接"
          description="这些凭证只服务于资料解析、语音转写和发布，不参与默认生成模型选择。"
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
            <CardTitle className="text-base">小红书热点 Cookie</CardTitle>
            <CardDescription>
              只允许用于本地开发和用户本人可访问的来源。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              开发环境请在“热点研究 →
              来源连接”里配置；生产环境必须迁移为用户级加密凭证，不能使用服务器本地
              JSON。
            </p>
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
  const connection = status?.connection;
  const notConfigured =
    connection === "not_configured" || (!loading && !summary?.configured);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">发布账号授权（AiToEarn）</CardTitle>
            <CardDescription className="mt-1.5">
              先保存 AiToEarn API Key，再分别授权平台账号。每位用户只能看到自己的授权账号。
            </CardDescription>
          </div>
          <AiToEarnConnectionBadge connection={connection} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {notConfigured ? (
          <Alert data-testid="aitoearn-not-configured">
            <AlertTitle>连接未配置</AlertTitle>
            <AlertDescription>
              尚未保存 AiToEarn API Key。发布账号授权、素材直传与发布提交都需要先完成连接；系统不会用模拟数据代替。
            </AlertDescription>
          </Alert>
        ) : connection === "invalid" ? (
          <Alert variant="destructive" data-testid="aitoearn-invalid">
            <AlertTitle>凭证已失效或被撤销</AlertTitle>
            <AlertDescription>
              请在上方 AiToEarn 卡片替换凭证后重试授权。
            </AlertDescription>
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
            授权小红书
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
            授权抖音
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
            同步账号状态
          </Button>
        </div>

        <div data-testid="aitoearn-accounts">
          <p className="text-sm font-medium">已授权账号</p>
          {accountsError ? (
            <p className="mt-2 text-sm text-destructive">{accountsError}</p>
          ) : accounts === null ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {connection === "connected"
                ? "点击“同步账号状态”查看当前授权的发布账号。"
                : "完成连接后可在这里查看授权账号。"}
            </p>
          ) : accounts.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              暂无授权账号，请先完成平台授权。
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
                      {account.platform === "douyin" ? "抖音" : "小红书"}
                    </span>
                  </span>
                  <Badge
                    variant={account.status === "active" ? "secondary" : "destructive"}
                  >
                    {account.status === "active" ? "有效" : "已过期"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        {status ? (
          <Alert>
            <AlertTitle>平台发布规则（本地约束，实际以供应商为准）</AlertTitle>
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
  if (connection === "connected") {
    return (
      <Badge variant="secondary" data-testid="aitoearn-connection-badge">
        已连接
      </Badge>
    );
  }
  if (connection === "invalid") {
    return (
      <Badge variant="destructive" data-testid="aitoearn-connection-badge">
        凭证失效
      </Badge>
    );
  }
  return (
    <Badge variant="outline" data-testid="aitoearn-connection-badge">
      未配置
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
