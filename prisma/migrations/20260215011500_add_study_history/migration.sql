-- CreateEnum
CREATE TYPE "StudyMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "StudyThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "translation" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StudyMessageRole" NOT NULL,
    "kind" TEXT,
    "content" TEXT NOT NULL,
    "translation" TEXT,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyThread_userId_updatedAt_idx" ON "StudyThread"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "StudyThread_userId_archivedAt_updatedAt_idx" ON "StudyThread"("userId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "StudyMessage_threadId_createdAt_idx" ON "StudyMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "StudyMessage_userId_createdAt_idx" ON "StudyMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudyThread" ADD CONSTRAINT "StudyThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyMessage" ADD CONSTRAINT "StudyMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "StudyThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyMessage" ADD CONSTRAINT "StudyMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;