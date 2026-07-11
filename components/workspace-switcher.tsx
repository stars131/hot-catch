import Link from "next/link";
import {
  BarChart3,
  ChevronDown,
  CircleDashed,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import {
  getWorkspaceById,
  workspaceSwitcherGroups,
  type WorkspaceDefinition,
} from "@/lib/workspaces";
import { cn } from "@/lib/utils";

type WorkspaceSwitcherTone = "light" | "dark";

type WorkspaceSwitcherProps = {
  activeId: string;
  tone?: WorkspaceSwitcherTone;
  align?: "left" | "right";
  className?: string;
};

function WorkspaceIcon(props: { workspace: WorkspaceDefinition; className?: string }) {
  if (props.workspace.status === "planned") {
    return <CircleDashed className={props.className} />;
  }
  if (props.workspace.kind === "hotspots") {
    return <BarChart3 className={props.className} />;
  }
  return <MessageSquare className={props.className} />;
}

export function WorkspaceSwitcher({
  activeId,
  tone = "light",
  align = "left",
  className,
}: WorkspaceSwitcherProps) {
  const activeWorkspace = getWorkspaceById(activeId) ?? workspaceSwitcherGroups[0]?.items[0];
  const dark = tone === "dark";

  return (
    <details
      className={cn("group relative min-w-0", className)}
      data-testid="workspace-switcher"
    >
      <summary
        className={cn(
          "flex h-10 cursor-pointer list-none items-center gap-2 border px-2.5 text-left transition [&::-webkit-details-marker]:hidden",
          dark
            ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100 hover:bg-cyan-300/20"
            : "border-[#dedbd4] bg-white text-[#252321] shadow-sm hover:bg-[#f2f1ed]"
        )}
        data-testid="workspace-switcher-summary"
      >
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            dark ? "bg-cyan-300/10 text-cyan-100" : "bg-[#171717] text-white"
          )}
        >
          {activeWorkspace ? (
            <WorkspaceIcon workspace={activeWorkspace} className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-[10px] font-semibold uppercase tracking-normal",
              dark ? "text-slate-500" : "text-[#8b867e]"
            )}
          >
            切换工作区
          </span>
          <span className="block truncate text-sm font-semibold">
            {activeWorkspace?.label ?? "选择入口"}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 transition group-open:rotate-180" />
      </summary>

      <div
        className={cn(
          "absolute z-50 mt-2 w-[286px] border p-2 shadow-xl",
          align === "right" ? "right-0" : "left-0",
          dark
            ? "border-cyan-300/20 bg-[#07101d] text-slate-100 shadow-cyan-950/40"
            : "border-[#dedbd4] bg-white text-[#252321]"
        )}
      >
        {workspaceSwitcherGroups.map((group, index) => (
          <div key={group.id} className={index > 0 ? "mt-2" : undefined}>
            <p
              className={cn(
                "px-2 py-1 text-[10px] font-semibold uppercase tracking-normal",
                dark ? "text-slate-500" : "text-[#8b867e]"
              )}
            >
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((workspace) => (
                <WorkspaceSwitcherItem
                  key={workspace.id}
                  workspace={workspace}
                  active={workspace.id === activeId}
                  tone={tone}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function WorkspaceSwitcherItem(props: {
  workspace: WorkspaceDefinition;
  active: boolean;
  tone: WorkspaceSwitcherTone;
}) {
  const dark = props.tone === "dark";
  const ready = props.workspace.status === "ready";
  const className = cn(
    "flex w-full items-center gap-2 border px-2 py-2 text-left transition",
    ready ? "cursor-pointer" : "cursor-not-allowed opacity-60",
    props.active
      ? dark
        ? "border-cyan-300/50 bg-cyan-300/10 text-cyan-100"
        : "border-[#171717] bg-[#171717] text-white"
      : dark
        ? "border-transparent text-slate-300 hover:border-cyan-300/25 hover:bg-cyan-300/10"
        : "border-transparent text-[#55514b] hover:bg-[#f2f1ed]",
  );
  const iconClassName = cn("h-3.5 w-3.5", props.active && !dark ? "text-white" : "");
  const content = (
    <>
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          props.active
            ? dark
              ? "bg-cyan-300/10 text-cyan-100"
              : "bg-white/10 text-white"
            : dark
              ? "bg-[#0b1220] text-slate-400"
              : "bg-[#f4f3ef] text-[#77736d]"
        )}
      >
        <WorkspaceIcon workspace={props.workspace} className={iconClassName} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{props.workspace.label}</span>
        <span
          className={cn(
            "block truncate text-[11px]",
            props.active
              ? dark
                ? "text-cyan-100/70"
                : "text-white/70"
              : dark
                ? "text-slate-500"
                : "text-[#8b867e]"
          )}
        >
          {props.workspace.description}
        </span>
      </span>
      {ready ? null : (
        <span
          className={cn(
            "shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold",
            dark ? "border-slate-700 text-slate-500" : "border-[#dedbd4] text-[#8b867e]"
          )}
        >
          待接入
        </span>
      )}
    </>
  );

  if (!ready) {
    return (
      <button type="button" className={className} disabled aria-disabled="true">
        {content}
      </button>
    );
  }

  return (
    <Link href={props.workspace.href} className={className}>
      {content}
    </Link>
  );
}
