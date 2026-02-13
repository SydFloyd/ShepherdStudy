/*
  Warnings:

  - Added the required column `sessionId` to the `StudyGraphEdge` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stepIndex` to the `StudyGraphEdge` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sessionId` to the `StudyGraphNode` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "StudyGraphSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudyGraphSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StudyGraphEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "selectionKind" TEXT,
    "stepIndex" INTEGER NOT NULL,
    "reason" TEXT,
    "application" TEXT,
    "confidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyGraphEdge_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudyGraphSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyGraphEdge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyGraphEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "StudyGraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyGraphEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "StudyGraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StudyGraphEdge" ("application", "confidence", "createdAt", "fromNodeId", "id", "kind", "reason", "toNodeId", "userId") SELECT "application", "confidence", "createdAt", "fromNodeId", "id", "kind", "reason", "toNodeId", "userId" FROM "StudyGraphEdge";
DROP TABLE "StudyGraphEdge";
ALTER TABLE "new_StudyGraphEdge" RENAME TO "StudyGraphEdge";
CREATE INDEX "StudyGraphEdge_userId_sessionId_createdAt_idx" ON "StudyGraphEdge"("userId", "sessionId", "createdAt");
CREATE INDEX "StudyGraphEdge_fromNodeId_kind_createdAt_idx" ON "StudyGraphEdge"("fromNodeId", "kind", "createdAt");
CREATE UNIQUE INDEX "StudyGraphEdge_fromNodeId_toNodeId_kind_stepIndex_key" ON "StudyGraphEdge"("fromNodeId", "toNodeId", "kind", "stepIndex");
CREATE TABLE "new_StudyGraphNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT,
    "passageRef" TEXT,
    "promptText" TEXT,
    "normalizedKey" TEXT,
    "translation" TEXT,
    "isUserInput" BOOLEAN NOT NULL DEFAULT false,
    "answer" TEXT,
    "context" TEXT,
    "relevance" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudyGraphNode_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudyGraphSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyGraphNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_StudyGraphNode" ("answer", "context", "createdAt", "id", "kind", "mode", "normalizedKey", "passageRef", "promptText", "relevance", "translation", "updatedAt", "userId") SELECT "answer", "context", "createdAt", "id", "kind", "mode", "normalizedKey", "passageRef", "promptText", "relevance", "translation", "updatedAt", "userId" FROM "StudyGraphNode";
DROP TABLE "StudyGraphNode";
ALTER TABLE "new_StudyGraphNode" RENAME TO "StudyGraphNode";
CREATE INDEX "StudyGraphNode_userId_sessionId_createdAt_idx" ON "StudyGraphNode"("userId", "sessionId", "createdAt");
CREATE INDEX "StudyGraphNode_userId_sessionId_kind_normalizedKey_idx" ON "StudyGraphNode"("userId", "sessionId", "kind", "normalizedKey");
CREATE UNIQUE INDEX "StudyGraphNode_sessionId_kind_translation_normalizedKey_key" ON "StudyGraphNode"("sessionId", "kind", "translation", "normalizedKey");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "StudyGraphSession_userId_createdAt_idx" ON "StudyGraphSession"("userId", "createdAt");
