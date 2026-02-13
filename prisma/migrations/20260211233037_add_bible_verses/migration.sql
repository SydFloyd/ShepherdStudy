-- CreateTable
CREATE TABLE "BibleVerse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "translation" TEXT NOT NULL,
    "bookCode" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "bookOrder" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "text" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "BibleVerse_translation_book_chapter_verse_idx" ON "BibleVerse"("translation", "book", "chapter", "verse");

-- CreateIndex
CREATE INDEX "BibleVerse_translation_bookOrder_chapter_idx" ON "BibleVerse"("translation", "bookOrder", "chapter");

-- CreateIndex
CREATE UNIQUE INDEX "BibleVerse_translation_bookOrder_chapter_verse_key" ON "BibleVerse"("translation", "bookOrder", "chapter", "verse");
