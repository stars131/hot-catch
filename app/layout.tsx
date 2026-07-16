import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { WorkspaceChrome } from "@/components/workspace-chrome";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Metadata");
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <WorkspaceChrome>{children}</WorkspaceChrome>
          <Providers />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
