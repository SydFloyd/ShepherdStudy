type StudyThreadRecord = {
  id: string;
  userId: string;
  title: string | null;
  translation: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type StudyMessageRecord = {
  id: string;
  threadId: string;
  userId: string;
  role: "USER" | "ASSISTANT";
  kind: string | null;
  content: string;
  translation: string | null;
  response: unknown;
  createdAt: Date;
};

let idCounter = 0;

function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

export function createFakePrisma() {
  const studyThreads: StudyThreadRecord[] = [];
  const studyMessages: StudyMessageRecord[] = [];

  const tx = {
    studyThread: {
      async findFirst(args: {
        where: { id: string; userId: string; archivedAt?: null };
        include?: { messages: { orderBy: { createdAt: "asc" | "desc" } } };
      }) {
        const match = studyThreads.find(
          (thread) =>
            thread.id === args.where.id &&
            thread.userId === args.where.userId &&
            (args.where.archivedAt === undefined || thread.archivedAt === null)
        );
        if (!match) {
          return null;
        }
        if (!args.include) {
          return { ...match };
        }
        const messages = studyMessages
          .filter((message) => message.threadId === match.id)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((message) => ({ ...message }));
        return { ...match, messages };
      },
      async findMany(args: {
        where: { userId: string; archivedAt: null };
        orderBy: { updatedAt: "asc" | "desc" };
        take: number;
      }) {
        const sorted = studyThreads
          .filter(
            (thread) =>
              thread.userId === args.where.userId &&
              thread.archivedAt === args.where.archivedAt
          )
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, args.take)
          .map((thread) => ({ ...thread }));
        return sorted;
      },
      async create(args: {
        data: { userId: string; title: string; translation?: string | null };
      }) {
        const created: StudyThreadRecord = {
          id: nextId("studyThread"),
          userId: args.data.userId,
          title: args.data.title,
          translation: args.data.translation ?? null,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        studyThreads.push(created);
        return { ...created };
      },
      async update(args: {
        where: { id: string };
        data: {
          translation?: string;
          updatedAt?: Date;
          title?: string;
          archivedAt?: Date | null;
        };
      }) {
        const idx = studyThreads.findIndex((thread) => thread.id === args.where.id);
        if (idx === -1) {
          throw new Error("study thread not found");
        }
        const current = studyThreads[idx];
        const updated: StudyThreadRecord = {
          ...current,
          translation:
            args.data.translation === undefined
              ? current.translation
              : args.data.translation,
          title: args.data.title === undefined ? current.title : args.data.title,
          archivedAt:
            args.data.archivedAt === undefined
              ? current.archivedAt
              : args.data.archivedAt,
          updatedAt: args.data.updatedAt ?? new Date()
        };
        studyThreads[idx] = updated;
        return { ...updated };
      }
    },
    studyMessage: {
      async createMany(args: {
        data: Array<{
          threadId: string;
          userId: string;
          role: "USER" | "ASSISTANT";
          kind?: string;
          content: string;
          translation?: string;
          response?: unknown;
        }>;
      }) {
        for (const item of args.data) {
          studyMessages.push({
            id: nextId("studyMessage"),
            threadId: item.threadId,
            userId: item.userId,
            role: item.role,
            kind: item.kind ?? null,
            content: item.content,
            translation: item.translation ?? null,
            response: item.response ?? null,
            createdAt: new Date()
          });
        }
        return { count: args.data.length };
      }
    }
  };

  return {
    $transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) =>
      callback(tx),
    ...tx
  };
}
