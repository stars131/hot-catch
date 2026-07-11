"use client";

import Link from "next/link";
import {
  Flame,
  Lightbulb,
  LineChart,
  Pencil,
  Plug,
  Plus,
  Send,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/creator/conversation-client";

const PRIMARY_NAV = [
  { href: "/creator/xiaohongshu", label: "创作", icon: Pencil, current: true },
  { href: "/hotspots", label: "热点", icon: Flame },
  { href: "/ideas", label: "选题", icon: Lightbulb },
  { href: "/publish", label: "发布", icon: Send },
  { href: "/retrospectives", label: "复盘", icon: LineChart },
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
      <div className="shrink-0 p-3">
        <Button
          className="w-full justify-start gap-2 rounded-lg bg-[#C83B32] text-[#FFFDF9] hover:bg-[#B3352D]"
          onClick={props.onNew}
        >
          <Plus className="h-4 w-4" /> 新建创作
        </Button>
      </div>

      <nav aria-label="主导航" className="shrink-0 px-3 pb-2">
        <ul className="space-y-0.5">
          {PRIMARY_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={"current" in item && item.current ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm",
                  "current" in item && item.current
                    ? "bg-[#EDE9E0] font-medium text-[#1F1D19]"
                    : "text-[#746F67] hover:bg-[#EDE9E0] hover:text-[#1F1D19]",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mx-3 shrink-0 border-t border-[#DDD7CE]" />

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-2" data-testid="conversation-list">
        {props.loading ? (
          <div className="space-y-2 py-1">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-9 animate-pulse rounded-lg bg-[#EDE9E0]" />
            ))}
          </div>
        ) : props.conversations.length === 0 ? (
          <p className="px-2 py-3 text-xs leading-5 text-[#746F67]">
            还没有创作会话。点击上方「新建创作」开始。
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-[#746F67]">
                {group.label}
              </p>
              <ul className="space-y-0.5">
                {group.items.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => props.onSelect(conversation.id)}
                      aria-current={conversation.id === props.activeId ? "true" : undefined}
                      className={cn(
                        "w-full rounded-lg px-2.5 py-1.5 text-left text-sm",
                        conversation.id === props.activeId
                          ? "bg-[#EDE9E0] font-medium text-[#1F1D19]"
                          : "text-[#4A463F] hover:bg-[#EDE9E0]",
                      )}
                    >
                      <span className="block truncate">
                        {conversation.title || "未命名会话"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 border-t border-[#DDD7CE] p-3">
        <ul className="space-y-0.5">
          <li>
            <Link
              href="/settings/connections"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-[#746F67] hover:bg-[#EDE9E0] hover:text-[#1F1D19]"
            >
              <Plug className="h-4 w-4" /> 连接
            </Link>
          </li>
          <li>
            <Link
              href="/settings/connections"
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-[#746F67] hover:bg-[#EDE9E0] hover:text-[#1F1D19]"
            >
              <Settings className="h-4 w-4" /> 设置
            </Link>
          </li>
        </ul>
      </div>
    </div>
  );
}
