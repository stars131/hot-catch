import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { isDevelopmentAuthBypassEnabled } from "@/lib/env";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";

export default async function SignInPage(props: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const searchParams = await props.searchParams;
  const callbackUrl = searchParams.callbackUrl || "/creator";
  const t = await getTranslations("SignIn");
  if (session) redirect(callbackUrl);

  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    await signIn("resend", { email, redirectTo: callbackUrl });
  }

  async function enterDevelopment() {
    "use server";
    await signIn("development", { redirectTo: callbackUrl });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <section className="w-full max-w-md rounded-xl border bg-card p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="editorial-label">{t("eyebrow")}</p>
          <LanguageSwitcher />
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {t("description")}
        </p>
        {searchParams.error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {t("error")}
          </p>
        ) : null}
        <form action={sendMagicLink} className="mt-6 space-y-3">
          <label className="block text-sm font-medium" htmlFor="email">
            {t("email")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
            placeholder="creator@example.com"
          />
          <button className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground">
            {t("submit")}
          </button>
        </form>
        {isDevelopmentAuthBypassEnabled() ? (
          <form action={enterDevelopment} className="mt-3">
            <button className="h-11 w-full rounded-lg border bg-background px-4 text-sm font-medium">
              {t("development")}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
