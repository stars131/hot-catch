"use client";

import { Languages, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("Common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const nextLocale = locale === "en-US" ? "zh-CN" : "en-US";

  async function switchLocale() {
    setPending(true);
    try {
      const response = await fetch("/api/settings/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale }),
      });
      if (!response.ok) throw new Error("locale update failed");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void switchLocale()}
      disabled={pending}
      aria-label={`${t("language")}: ${nextLocale === "en-US" ? t("english") : t("chinese")}`}
    >
      {pending ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Languages data-icon="inline-start" />}
      {nextLocale === "en-US" ? "EN" : "中文"}
    </Button>
  );
}
