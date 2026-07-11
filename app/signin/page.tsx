import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { isDevelopmentAuthBypassEnabled } from "@/lib/env";

export default async function SignInPage(props: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const searchParams = await props.searchParams;
  const callbackUrl = searchParams.callbackUrl || "/creator/xiaohongshu";
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
        <p className="editorial-label">STARTRACE / INVITED BETA</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">登录星迹内容助手</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          当前为邀请制内测。输入受邀邮箱，我们会发送一次性登录链接。
        </p>
        {searchParams.error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            登录未完成，请确认邮箱已被邀请且邀请仍在有效期内。
          </p>
        ) : null}
        <form action={sendMagicLink} className="mt-6 space-y-3">
          <label className="block text-sm font-medium" htmlFor="email">
            受邀邮箱
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
            发送登录链接
          </button>
        </form>
        {isDevelopmentAuthBypassEnabled() ? (
          <form action={enterDevelopment} className="mt-3">
            <button className="h-11 w-full rounded-lg border bg-background px-4 text-sm font-medium">
              使用本地开发账号
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
