import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { env, isDevelopmentAuthBypassEnabled } from "@/lib/env";

const providers: NextAuthConfig["providers"] = [];

if (env.AUTH_RESEND_KEY) {
  providers.push(
    Resend({
      apiKey: env.AUTH_RESEND_KEY,
      from: env.AUTH_EMAIL_FROM,
      async sendVerificationRequest({ identifier, url, provider }) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to: identifier,
            subject: "Startrace sign-in link / 星迹内容助手登录链接",
            html: bilingualMagicLinkHtml(url),
            text: [
              "Sign in to Startrace Content Assistant:",
              url,
              "",
              "登录星迹内容助手：",
              url,
              "",
              "If you did not request this email, you can ignore it.",
              "如果不是你发起的请求，请忽略本邮件。",
            ].join("\n"),
          }),
        });
        if (!response.ok) {
          throw new Error(`Resend error (${response.status})`);
        }
      },
    }),
  );
}

if (isDevelopmentAuthBypassEnabled()) {
  providers.push(
    Credentials({
      id: "development",
      name: "本地开发账号",
      credentials: {},
      authorize: async () =>
        prisma.user.upsert({
          where: { email: env.DEV_MOCK_USER_EMAIL },
          update: { name: env.DEV_MOCK_USER_NAME },
          create: {
            email: env.DEV_MOCK_USER_EMAIL,
            name: env.DEV_MOCK_USER_NAME,
          },
        }),
    }),
  );
}

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  secret: env.AUTH_SECRET || undefined,
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/signin" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "development" && isDevelopmentAuthBypassEnabled()) {
        return true;
      }

      const email = user.email?.trim().toLowerCase();
      if (!email) return false;

      const invitation = await prisma.invitation.findUnique({ where: { email } });
      return Boolean(
        invitation &&
          invitation.status !== "revoked" &&
          invitation.expiresAt > new Date(),
      );
    },
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email || !user.id) return;

      await prisma.invitation.updateMany({
        where: {
          email,
          status: "pending",
          expiresAt: { gt: new Date() },
        },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
          acceptedByUserId: user.id,
        },
      });
    },
  },
} satisfies NextAuthConfig;

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

function bilingualMagicLinkHtml(url: string) {
  const safeUrl = escapeHtml(url);
  return `<!doctype html><html><body style="margin:0;background:#f5f2ec;color:#1f1d19;font-family:Arial,sans-serif"><div style="max-width:560px;margin:32px auto;background:#fffdf9;border:1px solid #ddd7ce;border-radius:16px;padding:32px"><p style="font-size:12px;letter-spacing:.12em;color:#746f67">STARTRACE / 星迹内容助手</p><h1 style="font-size:24px;margin:20px 0 8px">Sign in to Startrace</h1><p style="line-height:1.7;color:#5f5a52">Use the secure link below to sign in. The link can only be used for this request.</p><p style="margin:24px 0"><a href="${safeUrl}" style="display:inline-block;background:#c83b32;color:#fff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:700">Sign in / 登录</a></p><hr style="border:0;border-top:1px solid #e8e2d8;margin:28px 0"><h2 style="font-size:20px;margin:0 0 8px">登录星迹内容助手</h2><p style="line-height:1.7;color:#5f5a52">点击上方安全链接完成登录。该链接仅用于本次请求；如果不是你发起的请求，请忽略本邮件。</p><p style="font-size:12px;line-height:1.6;color:#746f67;margin-top:28px;word-break:break-all">${safeUrl}</p></div></body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[character];
  });
}
