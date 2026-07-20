"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  FilePenLine,
  Flame,
  Lightbulb,
  ListTodo,
  PanelsTopLeft,
  Plus,
  Puzzle,
  Rocket,
  Settings,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/creator/conversation-client";
import { StartraceMark } from "@/components/startrace-mark";

const primaryNavigation = [
  { href: "/creator", label: "创作", icon: FilePenLine },
  { href: "/hotspots", label: "热点", icon: Flame },
  { href: "/ideas", label: "选题", icon: Lightbulb },
  { href: "/editor", label: "编辑", icon: PanelsTopLeft },
  { href: "/publish", label: "发布", icon: Rocket },
  { href: "/retrospectives", label: "复盘", icon: BarChart3 },
] as const;

const utilityNavigation = [
  { href: "/personas", label: "人设", icon: UserRound },
  { href: "/tasks", label: "任务", icon: ListTodo },
  { href: "/settings/connections", label: "连接", icon: Settings },
  { href: "/settings/skills", label: "技能", icon: Puzzle },
] as const;

function groupLabel(updatedAt: string, now: Date): "今天" | "近 7 天" | "更早" {
  const updated = new Date(updatedAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (updated >= startOfToday) return "今天";
  const sevenDaysAgo = new Date(startOfToday);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  if (updated >= sevenDaysAgo) return "近 7 天";
  return "更早";
}

export function ConversationSidebar(props: {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  const pathname = usePathname();
  const now = new Date();
  const groups: Array<{ label: string; items: ConversationSummary[] }> = [];
  for (const conversation of props.conversations) {
    const label = groupLabel(conversation.updatedAt, now);
    const group = groups.find((item) => item.label === label);
    if (group) group.items.push(conversation);
    else groups.push({ label, items: [conversation] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Link href="/creator" className="flex h-[72px] shrink-0 items-center gap-3 border-b px-4">
        <StartraceMark className="size-8" />
        <span className="min-w-0">
          <span className="block text-base font-semibold tracking-[-0.03em]">星迹</span>
          <span className="font-mono-metric block text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
            STARTRACE
          </span>
        </span>
      </Link>

      <div className="shrink-0 px-3 pb-2 pt-3">
        <Button
          className="w-full justify-start"
          onClick={props.onNew}
        >
          <Plus data-icon="inline-start" /> 新建创作
        </Button>
      </div>

      <nav aria-label="创作工作台主导航" className="flex shrink-0 flex-col gap-0.5 px-3 pb-3">
        {primaryNavigation.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground transition-[background-color,color,transform] duration-short ease-editorial active:translate-y-px",
                active
                  ? "bg-card text-foreground before:absolute before:-left-3 before:h-5 before:w-0.5 before:bg-primary"
                  : "hover:bg-card/60 hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4", active && "text-primary")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mx-3 shrink-0 border-t" />

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3" data-testid="conversation-list">
        {props.loading ? (
          <div className="flex flex-col gap-2 py-1">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-8 rounded-md" />
            ))}
          </div>
        ) : props.conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-5 text-muted-foreground">
            还没有创作会话。点击上方「新建创作」开始。
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-3">
              <p className="font-mono-metric px-2 pb-1 text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </p>
              <ul className="flex flex-col gap-0.5">
                {group.items.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => props.onSelect(conversation.id)}
                      aria-current={conversation.id === props.activeId ? "true" : undefined}
                      className={cn(
                        "w-full rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                        conversation.id === props.activeId
                          ? "bg-card font-medium text-foreground"
                          : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
                      )}
                    >
                      <span className="block truncate">
                        {conversation.title || "未命名会话"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <nav aria-label="创作工作台辅助导航" className="grid shrink-0 grid-cols-2 gap-1 border-t p-3">
        {utilityNavigation.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex h-9 items-center gap-2 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground"
            >
              <Icon className="size-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
