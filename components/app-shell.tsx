"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BookOpenText,
  ChevronRight,
  CircleAlert,
  FilePenLine,
  Flame,
  Lightbulb,
  Menu,
  Puzzle,
  Rocket,
  Settings,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/language-switcher";

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

type AppShellProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
};

export function AppShell({
  title,
  description,
  eyebrow = "STARTRACE / CREATOR OS",
  actions,
  children,
  contentClassName,
}: AppShellProps) {
  const pathname = usePathname();
  const t = useTranslations("Navigation");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dependencyState, setDependencyState] = useState<null | {
    database: string;
    redis: string;
  }>(null);

  useEffect(() => {
    let canceled = false;
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { dependencies?: { database: string; redis: string } };
        if (!canceled && body.dependencies) setDependencyState(body.dependencies);
      })
      .catch(() => {
        if (!canceled) setDependencyState({ database: "unavailable", redis: "unavailable" });
      });
    return () => {
      canceled = true;
    };
  }, []);

  const degraded =
    dependencyState &&
    (dependencyState.database !== "ok" || dependencyState.redis !== "ok");

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-[#ECE7DE] lg:flex lg:flex-col">
        <Brand />
        <nav aria-label={t("mainLabel")} className="flex-1 space-y-1 px-3 py-5">
          {navigation.map((item) => (
            <NavItem key={item.href} item={item} active={pathname.startsWith(item.href)} />
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
        <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
          <div className="flex min-h-[72px] items-center gap-4 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-card lg:hidden"
              aria-label={t("open")}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="editorial-label truncate">{eyebrow}</p>
              <div className="mt-1 flex min-w-0 items-baseline gap-3">
                <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
                {description ? (
                  <p className="hidden truncate text-sm text-muted-foreground md:block">{description}</p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <LanguageSwitcher />
              {actions}
            </div>
          </div>
          {degraded ? (
            <div className="flex items-center gap-2 border-t border-amber-300/60 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6 lg:px-8">
              <CircleAlert className="h-4 w-4 shrink-0" />
              <span>
                {t("dependencyWarning", {
                  database: dependencyState.database === "ok" ? t("ok") : t("unavailable"),
                  redis: dependencyState.redis === "ok" ? t("ok") : t("unavailable"),
                })}
              </span>
            </div>
          ) : null}
        </header>

        <main className={cn("min-w-0 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-8", contentClassName)}>
          {children}
        </main>
      </div>

      <nav
        aria-label={t("mobileLabel")}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-[#FFFDF9]/95 px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden"
      >
        {mobileNavigation.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium",
                active ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{t(item.shortLabelKey)}</span>
            </Link>
          );
        })}
      </nav>

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
                  onNavigate={() => setMobileMenuOpen(false)}
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
  onNavigate?: () => void;
}) {
  const t = useTranslations("Navigation");
  const Icon = props.item.icon;
  return (
    <Link
      href={props.item.href}
      onClick={props.onNavigate}
      className={cn(
        "group flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        props.active
          ? "bg-[#FFFDF9] text-foreground"
          : "text-muted-foreground hover:bg-[#F6F2EB] hover:text-foreground",
      )}
    >
      <Icon className={cn("h-4 w-4", props.active && "text-primary")} />
      <span className="flex-1">{t(props.item.labelKey)}</span>
      {props.active ? <ChevronRight className="h-3.5 w-3.5 text-primary" /> : null}
    </Link>
  );
}
