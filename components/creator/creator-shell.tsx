"use client";

import { type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * 创作专用壳层:左侧可折叠会话栏 + 居中消息主区 + 底部 Composer + 可选 Artifact 面板。
 * 不复用后台式 AppShell;≥1180px 显示常驻侧栏,窄屏用 Drawer。
 * Artifact 在 ≥1180px 作为右侧栏,窄屏/手机全屏覆盖主区(单实例,同一节点切换定位)。
 */
export function CreatorShell(props: {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
  composer: ReactNode;
  artifact?: ReactNode;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  drawerOpen: boolean;
  onDrawerOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="flex h-dvh min-h-0 bg-[#F4F1EA] text-[#1F1D19]">
      {/* 桌面常驻侧栏 */}
      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col border-r border-[#DDD7CE] bg-[#F5F4F1] transition-[width] duration-200 min-[1180px]:flex",
          props.sidebarCollapsed ? "w-0 overflow-hidden border-r-0" : "w-[248px]",
        )}
      >
        {props.sidebar}
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#DDD7CE] bg-[#F4F1EA]/95 px-3">
          {/* 窄屏:会话栏 Drawer */}
          <Sheet open={props.drawerOpen} onOpenChange={props.onDrawerOpenChange}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="min-[1180px]:hidden"
                aria-label="打开会话列表"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[280px] border-[#DDD7CE] bg-[#F5F4F1] p-0"
            >
              <SheetTitle className="sr-only">会话列表</SheetTitle>
              {props.sidebar}
            </SheetContent>
          </Sheet>

          {/* 桌面:折叠/展开侧栏 */}
          <Button
            variant="ghost"
            size="icon"
            className="hidden min-[1180px]:inline-flex"
            onClick={props.onToggleSidebar}
            aria-label={props.sidebarCollapsed ? "展开会话栏" : "折叠会话栏"}
          >
            {props.sidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </Button>

          <div className="min-w-0 flex-1">{props.topbar}</div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{props.children}</main>

        <div className="shrink-0 border-t border-[#DDD7CE] bg-[#F4F1EA] px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
          {props.composer}
        </div>
      </div>

      {props.artifact ? (
        <section
          className={cn(
            "min-h-0 bg-[#FFFDF9]",
            // <1180px:全屏覆盖主区(手机一次只显示对话或 Artifact)
            "fixed inset-0 z-40 flex flex-col",
            // ≥1180px:回到文档流,作为右侧栏
            "min-[1180px]:static min-[1180px]:z-auto min-[1180px]:w-[560px] min-[1180px]:shrink-0 min-[1180px]:border-l min-[1180px]:border-[#DDD7CE] min-[1440px]:w-[640px]",
          )}
          data-testid="artifact-panel-container"
        >
          {props.artifact}
        </section>
      ) : null}
    </div>
  );
}
