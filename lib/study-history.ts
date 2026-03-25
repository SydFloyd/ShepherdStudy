import { Prisma, StudyMessageRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { StudyResponsePayload } from "@/lib/study-contract";

const THREAD_TITLE_MAX = 72;

function normalizeTitle(text: string): string {
  const compact = text.trim().replace(/\s+/g, " ");
  if (compact.length <= THREAD_TITLE_MAX) {
    return compact;
  }
  return `${compact.slice(0, THREAD_TITLE_MAX - 1)}...`;
}

function deriveTitle(input: {
  kind: "prompt" | "verse";
  userText: string;
  passage?: string;
  passages?: string[];
}) {
  if (input.kind === "verse") {
    const passageList = (input.passages ?? []).map((item) => item.trim()).filter(Boolean);
    const verseLabel =
      passageList.length > 1
        ? `${passageList[0]} +${passageList.length - 1} verse${passageList.length - 1 === 1 ? "" : "s"}`
        : passageList[0] || input.passage?.trim() || input.userText.trim();
    return normalizeTitle(verseLabel || "Verse Study");
  }

  return normalizeTitle(input.userText || "Study Prompt");
}

export function toThreadSummary(thread: {
  id: string;
  title: string | null;
  translation: string | null;
  archivedAt: Date | null;
  updatedAt: Date;
}) {
  return {
    id: thread.id,
    title: thread.title ?? "Untitled Study",
    translation: thread.translation,
    archivedAt: thread.archivedAt?.toISOString() ?? null,
    updatedAt: thread.updatedAt.toISOString()
  };
}

export async function listStudyThreads(userId: string) {
  const threads = await prisma.studyThread.findMany({
    where: {
      userId,
      archivedAt: null
    },
    orderBy: { updatedAt: "desc" },
    take: 50
  });

  return threads.map(toThreadSummary);
}

export async function persistStudyTurn(input: {
  userId: string;
  threadId?: string;
  kind: "prompt" | "verse";
  userText: string;
  passage?: string;
  passages?: string[];
  translation: string;
  response: StudyResponsePayload;
}) {
  return prisma.$transaction(async (tx) => {
    let thread =
      input.threadId
        ? await tx.studyThread.findFirst({
            where: {
              id: input.threadId,
              userId: input.userId
            }
          })
        : null;

    if (!thread) {
      thread = await tx.studyThread.create({
        data: {
          userId: input.userId,
          title: deriveTitle({
            kind: input.kind,
            userText: input.userText,
            passage: input.passage,
            passages: input.passages
          }),
          translation: input.translation
        }
      });
    } else if (thread.archivedAt) {
      thread = await tx.studyThread.update({
        where: { id: thread.id },
        data: { archivedAt: null }
      });
    }

    await tx.studyMessage.createMany({
      data: [
        {
          threadId: thread.id,
          userId: input.userId,
          role: StudyMessageRole.USER,
          kind: input.kind,
          content: input.userText,
          translation: input.translation
        },
        {
          threadId: thread.id,
          userId: input.userId,
          role: StudyMessageRole.ASSISTANT,
          kind: input.kind,
          content: input.response.answer,
          translation: input.translation,
          response: input.response as Prisma.InputJsonValue
        }
      ]
    });

    const updated = await tx.studyThread.update({
      where: { id: thread.id },
      data: {
        translation: input.translation,
        updatedAt: new Date(),
        title:
          thread.title && thread.title.trim().length > 0
            ? thread.title
            : deriveTitle({
                kind: input.kind,
                userText: input.userText,
                passage: input.passage,
                passages: input.passages
              })
      }
    });

    return toThreadSummary(updated);
  });
}

export async function getStudyThreadDetail(input: {
  userId: string;
  threadId: string;
}) {
  const thread = await prisma.studyThread.findFirst({
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

  const turns = [];
  for (let index = 0; index < thread.messages.length; index += 1) {
    const userMessage = thread.messages[index];
    const assistantMessage = thread.messages[index + 1];

    if (
      !userMessage ||
      userMessage.role !== StudyMessageRole.USER ||
      !assistantMessage ||
      assistantMessage.role !== StudyMessageRole.ASSISTANT ||
      !assistantMessage.response
    ) {
      continue;
    }

      turns.push({
        id: assistantMessage.id,
        kind: (userMessage.kind === "verse" ? "verse" : "prompt") as
          | "prompt"
          | "verse",
        userText: userMessage.content,
        response: assistantMessage.response as unknown as StudyResponsePayload
      });
  }

  return {
    thread: toThreadSummary(thread),
    turns
  };
}
