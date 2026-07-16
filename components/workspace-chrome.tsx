"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpenText,
  ChevronRight,
  CircleAlert,
  FilePenLine,
  Flame,
  Lightbulb,
  Loader2,
  Menu,
  Puzzle,
  Rocket,
  Settings,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/creator", labelKey: "creator", shortLabelKey: "shortCreator", icon: FilePenLine },
  { href: "/hotspots", labelKey: "hotspots", shortLabelKey: "shortHotspots", icon: Flame },
  { href: "/ideas", labelKey: "ideas", shortLabelKey: "shortIdeas", icon: Lightbulb },
  { href: "/publish", labelKey: "publish", shortLabelKey: "shortPublish", icon: Rocket },
  { href: "/retrospectives", labelKey: "retrospectives", shortLabelKey: "shortRetrospectives", icon: BarChart3 },
  { href: "/settings/connections", labelKey: "connections", shortLabelKey: "connections", icon: Settings },
  { href: "/settings/skills", labelKey: "skills", shortLabelKey: "skills", icon: Puzzle },
] as const;

const mobileNavigation = navigation.filter((item) =>
  ["/creator", "/hotspots", "/ideas", "/publish", "/retrospectives"].includes(
    item.href,
  ),
);

const workspacePrefixes = [
  "/creator",
  "/hotspots",
  "/ideas",
  "/publish",
  "/retrospectives",
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

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-[#ECE7DE] lg:flex lg:flex-col">
        <Brand />
        <nav aria-label={t("mainLabel")} className="flex-1 space-y-1 px-3 py-5">
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
        <div className="m-3 rounded-xl border bg-[#F8F5EF] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <BookOpenText className="h-4 w-4 text-primary" />
            {t("workflowTitle")}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
            {t("workflowBody")}
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
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-[#FFFDF9]/95 px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden"
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
        className="fixed bottom-[calc(max(6px,env(safe-area-inset-bottom))+58px)] right-3 z-30 inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-card shadow-sm lg:hidden"
        aria-label={t("open")}
      >
        <Menu className="h-5 w-5" />
      </button>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-sm lg:hidden">
          <aside className="h-full w-[min(84vw,320px)] border-r bg-[#ECE7DE]">
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
            <nav className="space-y-1 p-3">
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
    <Link href="/creator" className="flex h-[72px] items-center gap-3 px-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <SlidersHorizontal className="h-4 w-4" />
      </span>
      <span>
        <span className="block text-sm font-semibold tracking-tight">STARTRACE</span>
        <span className="font-mono-metric block text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          {t("beta")}
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
  const t = useTranslations("Navigation");
  const Icon = props.item.icon;
  const preload = () => router.prefetch(props.item.href);
  return (
    <Link
      href={props.item.href}
      onClick={props.onNavigate}
      onMouseEnter={preload}
      onFocus={preload}
      aria-current={props.active ? "page" : undefined}
      className={cn(
        "group flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-[background-color,color,transform] duration-200 active:translate-y-px",
        props.active
          ? "bg-[#FFFDF9] text-foreground"
          : "text-muted-foreground hover:bg-[#F6F2EB] hover:text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4", props.active && "text-primary")} />
      <span className="flex-1">{t(props.item.labelKey)}</span>
      {props.pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
      ) : props.active ? (
        <ChevronRight className="h-3.5 w-3.5 text-primary" />
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
  const t = useTranslations("Navigation");
  const Icon = props.item.icon;
  const preload = () => router.prefetch(props.item.href);
  return (
    <Link
      href={props.item.href}
      onClick={props.onNavigate}
      onTouchStart={preload}
      onFocus={preload}
      aria-current={props.active ? "page" : undefined}
      className={cn(
        "flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors",
        props.active ? "bg-primary/10 text-primary" : "text-muted-foreground",
      )}
    >
      {props.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      <span className="truncate">{t(props.item.shortLabelKey)}</span>
    </Link>
  );
}
