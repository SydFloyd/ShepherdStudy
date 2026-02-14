-- CreateTable
CREATE TABLE "WwjdThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WwjdThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WwjdMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StudyMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "recommendations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WwjdMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WwjdThread_userId_updatedAt_idx" ON "WwjdThread"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "WwjdThread_userId_archivedAt_updatedAt_idx" ON "WwjdThread"("userId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "WwjdMessage_threadId_createdAt_idx" ON "WwjdMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "WwjdMessage_userId_createdAt_idx" ON "WwjdMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WwjdThread" ADD CONSTRAINT "WwjdThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WwjdMessage" ADD CONSTRAINT "WwjdMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "WwjdThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WwjdMessage" ADD CONSTRAINT "WwjdMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;