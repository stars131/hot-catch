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
