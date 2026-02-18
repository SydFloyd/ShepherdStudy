import { prisma } from "@/lib/prisma";

export async function resolveActiveUserId(userId?: string | null) {
  if (!userId) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });
    return user?.id ?? null;
  } catch {
    return null;
  }
}

