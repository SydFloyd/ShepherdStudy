import { Prisma, StudyMessageRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { StudyRecommendation } from "@/lib/study-contract";
import { WwjdChatMessage } from "@/lib/wwjd-contract";

function normalizeTitle(text: string) {
  const compact = text.trim().replace(/\s+/g, " ");
  if (compact.length <= 72) {
    return compact;
  }
  return `${compact.slice(0, 71)}...`;
}

export function toWwjdThreadSummary(thread: {
  id: string;
  title: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: thread.id,
    title: thread.title ?? "Untitled WWJD",
    archivedAt: thread.archivedAt?.toISOString() ?? null,
    updatedAt: thread.updatedAt.toISOString()
  };
}

export async function listWwjdThreads(userId: string) {
  const threads = await prisma.wwjdThread.findMany({
    where: {
      userId,
      archivedAt: null
    },
    orderBy: { updatedAt: "desc" },
    take: 50
  });
  return threads.map(toWwjdThreadSummary);
}

export async function persistWwjdTurn(input: {
  userId: string;
  threadId?: string;
  userMessage: string;
  reply: string;
  recommendations: StudyRecommendation[];
}) {
  return prisma.$transaction(async (tx) => {
    let thread =
      input.threadId
        ? await tx.wwjdThread.findFirst({
            where: {
              id: input.threadId,
              userId: input.userId
            }
          })
        : null;

    if (!thread) {
      thread = await tx.wwjdThread.create({
        data: {
          userId: input.userId,
          title: normalizeTitle(input.userMessage || "WWJD")
        }
      });
    } else if (thread.archivedAt) {
      thread = await tx.wwjdThread.update({
        where: { id: thread.id },
        data: { archivedAt: null }
      });
    }

    await tx.wwjdMessage.createMany({
      data: [
        {
          threadId: thread.id,
          userId: input.userId,
          role: StudyMessageRole.USER,
          content: input.userMessage
        },
        {
          threadId: thread.id,
          userId: input.userId,
          role: StudyMessageRole.ASSISTANT,
          content: input.reply,
          recommendations: input.recommendations as Prisma.InputJsonValue
        }
      ]
    });

    const updated = await tx.wwjdThread.update({
      where: { id: thread.id },
      data: { updatedAt: new Date() }
    });

    return toWwjdThreadSummary(updated);
  });
}

export async function getWwjdThreadDetail(input: {
  userId: string;
  threadId: string;
}) {
  const thread = await prisma.wwjdThread.findFirst({
    where: {
      id: input.threadId,
      userId: input.userId,
      archivedAt: null
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!thread) {
    return null;
  }

  const messages: WwjdChatMessage[] = thread.messages.map((message) => ({
    role: message.role === StudyMessageRole.USER ? "user" : "assistant",
    content: message.content,
    recommendations: Array.isArray(message.recommendations)
      ? (message.recommendations as unknown as StudyRecommendation[])
      : undefined
  }));

  return {
    thread: toWwjdThreadSummary(thread),
    messages
  };
}
