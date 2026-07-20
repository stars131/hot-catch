"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  BarChart3,
  ChevronRight,
  CircleAlert,
  FilePenLine,
  Flame,
  Lightbulb,
  Loader2,
  Menu,
  PanelsTopLeft,
  Puzzle,
  Rocket,
  Settings,
  ListTodo,
  UserRound,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { prefetchWorkspaceData } from "@/lib/workspace-prefetch";
import { StartraceMark } from "@/components/startrace-mark";

const navigation = [
  { href: "/creator", labelKey: "creator", shortLabelKey: "shortCreator", icon: FilePenLine },
  { href: "/hotspots", labelKey: "hotspots", shortLabelKey: "shortHotspots", icon: Flame },
  { href: "/ideas", labelKey: "ideas", shortLabelKey: "shortIdeas", icon: Lightbulb },
  { href: "/editor", labelKey: "editor", shortLabelKey: "shortEditor", icon: PanelsTopLeft },
  { href: "/publish", labelKey: "publish", shortLabelKey: "shortPublish", icon: Rocket },
  { href: "/retrospectives", labelKey: "retrospectives", shortLabelKey: "shortRetrospectives", icon: BarChart3 },
  { href: "/personas", labelKey: "personas", shortLabelKey: "personas", icon: UserRound },
  { href: "/tasks", labelKey: "tasks", shortLabelKey: "tasks", icon: ListTodo },
  { href: "/settings/connections", labelKey: "connections", shortLabelKey: "connections", icon: Settings },
  { href: "/settings/skills", labelKey: "skills", shortLabelKey: "skills", icon: Puzzle },
] as const;

const mobileNavigation = navigation.filter((item) =>
  ["/creator", "/hotspots", "/ideas", "/editor", "/publish"].includes(
    item.href,
  ),
);

const workspacePrefixes = [
  "/hotspots",
  "/ideas",
  "/editor",
  "/publish",
  "/retrospectives",
  "/personas",
  "/tasks",
  "/settings",
] as const;

type DependencyState = {
  database: string;
  redis: string;
};

export function WorkspaceChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("Navigation");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [dependencyState, setDependencyState] = useState<DependencyState | null>(null);
  const inWorkspace = workspacePrefixes.some((prefix) => pathname.startsWith(prefix));

  useEffect(() => {
    setPendingHref(null);
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!inWorkspace || dependencyState) return;
    let canceled = false;
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { dependencies?: DependencyState };
        if (!canceled && body.dependencies) setDependencyState(body.dependencies);
      })
      .catch(() => {
        if (!canceled) {
          setDependencyState({ database: "unavailable", redis: "unavailable" });
        }
      });
    return () => {
      canceled = true;
    };
  }, [dependencyState, inWorkspace]);

  if (!inWorkspace) return children;

  const degraded =
    dependencyState &&
    (dependencyState.database !== "ok" || dependencyState.redis !== "ok");

  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#workspace-main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t("skipToContent")}
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-rail lg:flex lg:flex-col">
        <Brand />
        <nav aria-label={t("mainLabel")} className="flex flex-1 flex-col gap-1 px-3 py-5">
          {navigation.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              active={pathname.startsWith(item.href)}
              pending={pendingHref === item.href}
              onNavigate={() => setPendingHref(item.href)}
            />
          ))}
        </nav>
        <div className="mx-5 mb-5 border-t pt-4">
          <p className="font-mono-metric text-[9px] uppercase leading-4 tracking-[0.14em] text-muted-foreground">
            research · create · publish
          </p>
        </div>
      </aside>

      <div className="min-h-dvh lg:pl-60">
        {pendingHref ? (
          <div
            aria-hidden="true"
            className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary/15 lg:left-60"
          >
            <div className="h-full w-1/3 animate-pulse bg-primary" />
          </div>
        ) : null}
        {degraded ? (
          <div className="flex items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6 lg:px-8">
            <CircleAlert className="h-4 w-4 shrink-0" />
            <span>
              {t("dependencyWarning", {
                database: dependencyState.database === "ok" ? t("ok") : t("unavailable"),
                redis: dependencyState.redis === "ok" ? t("ok") : t("unavailable"),
              })}
            </span>
          </div>
        ) : null}
        <div id="workspace-main">{children}</div>
      </div>

      <nav
        aria-label={t("mobileLabel")}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden"
      >
        {mobileNavigation.map((item) => (
          <MobileNavItem
            key={item.href}
            item={item}
            active={pathname.startsWith(item.href)}
            pending={pendingHref === item.href}
            onNavigate={() => setPendingHref(item.href)}
          />
        ))}
      </nav>

      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        className="fixed bottom-[calc(max(6px,env(safe-area-inset-bottom))+62px)] right-3 z-30 inline-flex size-11 items-center justify-center rounded-md border bg-card shadow-float lg:hidden"
        aria-label={t("open")}
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm lg:hidden">
          <aside className="h-full w-[min(84vw,320px)] border-r bg-rail">
            <div className="flex items-center justify-between border-b pr-3">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-card"
                aria-label={t("close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3">
              {navigation.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  active={pathname.startsWith(item.href)}
                  pending={pendingHref === item.href}
                  onNavigate={() => setPendingHref(item.href)}
                />
              ))}
            </nav>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Brand() {
  const t = useTranslations("Navigation");
  return (
    <Link href="/creator" className="flex h-20 items-center gap-3 border-b px-5">
      <StartraceMark />
      <span>
        <span className="block text-base font-semibold tracking-[-0.03em]">星迹</span>
        <span className="font-mono-metric block text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
          STARTRACE · {t("beta")}
        </span>
      </span>
    </Link>
  );
}

function NavItem(props: {
  item: (typeof navigation)[number];
  active: boolean;
  pending: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("Navigation");
  const Icon = props.item.icon;
  const preload = () => {
    router.prefetch(props.item.href);
    prefetchWorkspaceData(queryClient, props.item.href);
  };
  return (
    <Link
      href={props.item.href}
      onClick={props.onNavigate}
      onMouseEnter={preload}
      onFocus={preload}
      aria-current={props.active ? "page" : undefined}
      className={cn(
        "group relative flex h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-[background-color,color,transform] duration-short ease-editorial active:translate-y-px",
        props.active
          ? "bg-card text-foreground before:absolute before:-left-3 before:h-5 before:w-0.5 before:bg-primary"
          : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4", props.active && "text-primary")} />
      <span className="flex-1">{t(props.item.labelKey)}</span>
      {props.pending ? (
        <Loader2 className="size-3.5 animate-spin text-primary" />
      ) : props.active ? (
        <ChevronRight className="size-3.5 text-primary" />
      ) : null}
    </Link>
  );
}

function MobileNavItem(props: {
  item: (typeof navigation)[number];
  active: boolean;
  pending: boolean;
  onNavigate: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations("Navigation");
  const Icon = props.item.icon;
  const preload = () => {
    router.prefetch(props.item.href);
    prefetchWorkspaceData(queryClient, props.item.href);
  };
  return (
    <Link
      href={props.item.href}
      onClick={props.onNavigate}
      onTouchStart={preload}
      onFocus={preload}
      aria-current={props.active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 border-t-2 border-transparent px-1 py-2 text-[10px] font-medium transition-colors",
        props.active ? "border-primary text-primary" : "text-muted-foreground",
      )}
    >
      {props.pending ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      <span className="truncate">{t(props.item.shortLabelKey)}</span>
    </Link>
  );
}
