import { prisma } from "@/lib/prisma";
import { env, isDevelopmentAuthBypassEnabled } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  const sessionUserId = session?.user?.id;

  if (sessionUserId) {
    const user = await prisma.user.findUnique({ where: { id: sessionUserId } });
    if (user) return user;
  }

  if (!isDevelopmentAuthBypassEnabled()) {
    throw new AppError("UNAUTHORIZED", "请先登录后继续。", 401);
  }

  return prisma.user.upsert({
    where: { email: env.DEV_MOCK_USER_EMAIL },
    update: { name: env.DEV_MOCK_USER_NAME },
    create: {
      email: env.DEV_MOCK_USER_EMAIL,
      name: env.DEV_MOCK_USER_NAME,
    },
  });
}
