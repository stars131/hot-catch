import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

export async function requireUser() {
  return prisma.user.upsert({
    where: { email: env.DEV_MOCK_USER_EMAIL },
    update: { name: env.DEV_MOCK_USER_NAME },
    create: {
      email: env.DEV_MOCK_USER_EMAIL,
      name: env.DEV_MOCK_USER_NAME,
    },
  });
}
