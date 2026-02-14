-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "StudyGraphNodeKind" AS ENUM ('PROMPT', 'VERSE');

-- CreateEnum
CREATE TYPE "StudyGraphEdgeKind" AS ENUM ('SELECTS', 'RECOMMENDS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "passage" TEXT NOT NULL,
    "context" TEXT,
    "summary" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibleVerse" (
    "id" SERIAL NOT NULL,
    "translation" TEXT NOT NULL,
    "bookCode" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "bookOrder" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "paragraph" INTEGER NOT NULL DEFAULT 1,
    "text" TEXT NOT NULL,

    CONSTRAINT "BibleVerse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BibleFootnote" (
    "id" SERIAL NOT NULL,
    "translation" TEXT NOT NULL,
    "bookCode" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "bookOrder" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "caller" TEXT,
    "text" TEXT NOT NULL,

    CONSTRAINT "BibleFootnote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyGraphNode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "StudyGraphNodeKind" NOT NULL,
    "mode" TEXT,
    "passageRef" TEXT,
    "promptText" TEXT,
    "normalizedKey" TEXT,
    "translation" TEXT,
    "isUserInput" BOOLEAN NOT NULL DEFAULT false,
    "answer" TEXT,
    "context" TEXT,
    "relevance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyGraphNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyGraphEdge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "kind" "StudyGraphEdgeKind" NOT NULL,
    "selectionKind" TEXT,
    "stepIndex" INTEGER NOT NULL,
    "reason" TEXT,
    "application" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudyGraphEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyGraphSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyGraphSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "BibleVerse_translation_book_chapter_verse_idx" ON "BibleVerse"("translation", "book", "chapter", "verse");

-- CreateIndex
CREATE INDEX "BibleVerse_translation_bookOrder_chapter_idx" ON "BibleVerse"("translation", "bookOrder", "chapter");

-- CreateIndex
CREATE UNIQUE INDEX "BibleVerse_translation_bookOrder_chapter_verse_key" ON "BibleVerse"("translation", "bookOrder", "chapter", "verse");

-- CreateIndex
CREATE INDEX "BibleFootnote_translation_book_chapter_verse_idx" ON "BibleFootnote"("translation", "book", "chapter", "verse");

-- CreateIndex
CREATE INDEX "BibleFootnote_translation_bookOrder_chapter_verse_idx" ON "BibleFootnote"("translation", "bookOrder", "chapter", "verse");

-- CreateIndex
CREATE INDEX "StudyGraphNode_userId_sessionId_createdAt_idx" ON "StudyGraphNode"("userId", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "StudyGraphNode_userId_sessionId_kind_normalizedKey_idx" ON "StudyGraphNode"("userId", "sessionId", "kind", "normalizedKey");

-- CreateIndex
CREATE UNIQUE INDEX "StudyGraphNode_sessionId_kind_translation_normalizedKey_key" ON "StudyGraphNode"("sessionId", "kind", "translation", "normalizedKey");

-- CreateIndex
CREATE INDEX "StudyGraphEdge_userId_sessionId_createdAt_idx" ON "StudyGraphEdge"("userId", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "StudyGraphEdge_fromNodeId_kind_createdAt_idx" ON "StudyGraphEdge"("fromNodeId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudyGraphEdge_fromNodeId_toNodeId_kind_stepIndex_key" ON "StudyGraphEdge"("fromNodeId", "toNodeId", "kind", "stepIndex");

-- CreateIndex
CREATE INDEX "StudyGraphSession_userId_createdAt_idx" ON "StudyGraphSession"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGraphNode" ADD CONSTRAINT "StudyGraphNode_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudyGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGraphNode" ADD CONSTRAINT "StudyGraphNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGraphEdge" ADD CONSTRAINT "StudyGraphEdge_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudyGraphSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGraphEdge" ADD CONSTRAINT "StudyGraphEdge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGraphEdge" ADD CONSTRAINT "StudyGraphEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "StudyGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGraphEdge" ADD CONSTRAINT "StudyGraphEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "StudyGraphNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyGraphSession" ADD CONSTRAINT "StudyGraphSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

