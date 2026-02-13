-- CreateTable
CREATE TABLE "StudyGraphNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mode" TEXT,
    "passageRef" TEXT,
    "promptText" TEXT,
    "normalizedKey" TEXT,
    "translation" TEXT NOT NULL,
    "answer" TEXT,
    "context" TEXT,
    "relevance" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "StudyGraphNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StudyGraphEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT,
    "application" TEXT,
    "confidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudyGraphEdge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyGraphEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "StudyGraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StudyGraphEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "StudyGraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "StudyGraphNode_userId_createdAt_idx" ON "StudyGraphNode"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StudyGraphNode_userId_kind_normalizedKey_idx" ON "StudyGraphNode"("userId", "kind", "normalizedKey");

-- CreateIndex
CREATE UNIQUE INDEX "StudyGraphNode_userId_kind_translation_normalizedKey_key" ON "StudyGraphNode"("userId", "kind", "translation", "normalizedKey");

-- CreateIndex
CREATE INDEX "StudyGraphEdge_userId_createdAt_idx" ON "StudyGraphEdge"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StudyGraphEdge_fromNodeId_kind_idx" ON "StudyGraphEdge"("fromNodeId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "StudyGraphEdge_fromNodeId_toNodeId_kind_key" ON "StudyGraphEdge"("fromNodeId", "toNodeId", "kind");
