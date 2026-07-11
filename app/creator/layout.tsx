import type { ReactNode } from "react";

export const metadata = {
  title: "星迹创作",
};

/** 创作路由专用布局:脱离后台式 AppShell,由 CreatorShell 提供会话骨架。 */
export default function CreatorLayout({ children }: { children: ReactNode }) {
  return <div className="h-dvh bg-[#F4F1EA]">{children}</div>;
}
