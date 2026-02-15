-- CreateTable
CREATE TABLE "BibleWord" (
    "id" SERIAL NOT NULL,
    "translation" TEXT NOT NULL,
    "bookCode" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "bookOrder" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "lemma" TEXT,
    "strong" TEXT,
    "morph" TEXT,

    CONSTRAINT "BibleWord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BibleWord_translation_bookOrder_chapter_verse_position_key" ON "BibleWord"("translation", "bookOrder", "chapter", "verse", "position");

-- CreateIndex
CREATE INDEX "BibleWord_translation_book_chapter_verse_idx" ON "BibleWord"("translation", "book", "chapter", "verse");

-- CreateIndex
CREATE INDEX "BibleWord_translation_strong_idx" ON "BibleWord"("translation", "strong");

-- CreateIndex
CREATE INDEX "BibleWord_translation_lemma_idx" ON "BibleWord"("translation", "lemma");
