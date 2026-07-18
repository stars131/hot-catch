import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { isDevelopmentAuthBypassEnabled } from "@/lib/env";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ensureInvitationForEmail } from "@/lib/services/invitation-service";

export default async function SignInPage(props: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; invite?: string }>;
}) {
  const session = await auth();
  const searchParams = await props.searchParams;
  const callbackUrl = safeCallbackUrl(searchParams.callbackUrl);
  const t = await getTranslations("SignIn");
  if (session) redirect(callbackUrl);

  async function sendMagicLink(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    const inviteCode = String(formData.get("inviteCode") ?? "").trim();
    let invitationReady = false;
    try {
      await ensureInvitationForEmail(email, inviteCode);
      invitationReady = true;
    } catch {
      invitationReady = false;
    }
    if (!invitationReady) {
      const query = new URLSearchParams({ error: "InviteAccessDenied", callbackUrl });
      redirect(`/signin?${query.toString()}`);
    }
    await signIn("resend", { email, redirectTo: callbackUrl });
  }

  async function enterDevelopment() {
    "use server";
    await signIn("development", { redirectTo: callbackUrl });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        <form action={sendMagicLink}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <p className="editorial-label">{t("eyebrow")}</p>
                <LanguageSwitcher />
              </div>
              <CardTitle className="mt-2 text-2xl" role="heading" aria-level={1}>{t("title")}</CardTitle>
              <CardDescription className="leading-6">{t("description")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {searchParams.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{t("error")}</AlertDescription>
                </Alert>
              ) : null}
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="creator@example.com"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inviteCode">{t("inviteCode")}</FieldLabel>
                  <Input
                    id="inviteCode"
                    name="inviteCode"
                    defaultValue={searchParams.invite ?? ""}
                    autoComplete="one-time-code"
                    placeholder="STAR-XXXXX-XXXXX-XXXXX-XXXXX"
                  />
                  <FieldDescription>{t("inviteCodeHelp")}</FieldDescription>
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button className="w-full" type="submit">{t("submit")}</Button>
            </CardFooter>
          </Card>
        </form>
        {isDevelopmentAuthBypassEnabled() ? (
          <form action={enterDevelopment} className="mt-3">
            <Button className="w-full" type="submit" variant="outline">
              {t("development")}
            </Button>
          </form>
        ) : null}
      </div>
    </main>
  );
}

function safeCallbackUrl(value?: string) {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/creator";
  return value;
}
