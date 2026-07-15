import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Creator");
  return { title: t("title"), description: t("description") };
}

/** 创作路由专用布局:脱离后台式 AppShell,由 CreatorShell 提供会话骨架。 */
export default function CreatorLayout({ children }: { children: ReactNode }) {
  return <div className="h-dvh bg-[#F4F1EA]">{children}</div>;
}
