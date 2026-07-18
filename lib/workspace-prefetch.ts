import type { QueryClient } from "@tanstack/react-query";

const STALE_TIME = 2 * 60 * 1000;

export function prefetchWorkspaceData(queryClient: QueryClient, href: string) {
  if (href === "/ideas") {
    prefetch(queryClient, ["workspace", "ideas"], () => getJson("/api/ideas"), 3 * 60 * 1000);
    return;
  }
  if (href === "/personas") {
    prefetch(queryClient, ["workspace", "social-connections"], () => getJson("/api/social-connections"), 3 * 60 * 1000);
    prefetch(queryClient, ["workspace", "personas", "global"], () => getJson("/api/personas?socialConnectionId=global"));
    prefetch(queryClient, ["workspace", "memories", "global", ""], () => getJson("/api/memories?socialConnectionId=global&q="), 60 * 1000);
    return;
  }
  if (href === "/retrospectives") {
    prefetch(queryClient, ["workspace", "retrospectives", "due"], () => getJson("/api/retrospectives/due"));
    return;
  }
  if (href === "/tasks") {
    prefetch(queryClient, ["workspace", "task-center"], async () => {
      const [tasks, workflowData] = await Promise.all([
        getJson<Record<string, unknown>>("/api/tasks"),
        getJson<{ workflows?: unknown[] }>("/api/workflows"),
      ]);
      return { tasks, workflows: workflowData.workflows ?? [] };
    }, 20 * 1000);
    return;
  }
  if (href === "/settings/skills") {
    prefetch(queryClient, ["workspace", "skills"], () => getJson("/api/settings/skills"), 5 * 60 * 1000);
    return;
  }
  if (href === "/settings/connections") {
    prefetch(queryClient, ["workspace", "credential-summaries"], () => getJson("/api/settings/credentials"));
    prefetch(queryClient, ["workspace", "aitoearn-status"], () => getJson("/api/integrations/aitoearn/status"), 60 * 1000);
    return;
  }
  if (href === "/publish") {
    prefetch(queryClient, ["workspace", "publish"], loadPublishWorkspace);
  }
}

function prefetch<T>(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  queryFn: () => Promise<T>,
  staleTime = STALE_TIME,
) {
  void queryClient.prefetchQuery({ queryKey, queryFn, staleTime });
}

async function getJson<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Prefetch failed (${response.status})`);
  return response.json() as Promise<T>;
}

async function loadPublishWorkspace() {
  let accountsUnavailable = false;
  const [contentData, statusData, accountData, recordData] = await Promise.all([
    getJson<{ contents: unknown[] }>("/api/content/list"),
    getJson<{ connection: "connected" | "invalid" | "not_configured" }>("/api/integrations/aitoearn/status").catch(() => null),
    getJson<{ accounts: unknown[] }>("/api/integrations/aitoearn/accounts").catch(() => {
      accountsUnavailable = true;
      return { accounts: [] };
    }),
    getJson<{ records: unknown[]; providerMode?: "mock" | "real" }>("/api/publish/records"),
  ]);
  return {
    contents: contentData.contents,
    accounts: accountData.accounts,
    accountsUnavailable,
    connection: statusData?.connection ?? null,
    records: recordData.records,
    providerMode: recordData.providerMode ?? null,
  };
}
