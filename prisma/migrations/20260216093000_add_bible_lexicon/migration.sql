-- CreateTable
CREATE TABLE "BibleLexicon" (
    "id" SERIAL NOT NULL,
    "strong" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "translit" TEXT,
    "pronunciation" TEXT,
    "derivation" TEXT,
    "strongsDef" TEXT,
    "kjvDef" TEXT,
    "source" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BibleLexicon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BibleLexicon_strong_key" ON "BibleLexicon"("strong");

-- CreateIndex
CREATE INDEX "BibleLexicon_language_idx" ON "BibleLexicon"("language");

-- CreateIndex
CREATE INDEX "BibleLexicon_lemma_idx" ON "BibleLexicon"("lemma");
