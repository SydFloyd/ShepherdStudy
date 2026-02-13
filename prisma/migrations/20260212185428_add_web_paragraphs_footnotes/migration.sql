-- CreateTable
CREATE TABLE "BibleFootnote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "translation" TEXT NOT NULL,
    "bookCode" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "bookOrder" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "caller" TEXT,
    "text" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BibleVerse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "translation" TEXT NOT NULL,
    "bookCode" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "bookOrder" INTEGER NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "paragraph" INTEGER NOT NULL DEFAULT 1,
    "text" TEXT NOT NULL
);
INSERT INTO "new_BibleVerse" ("book", "bookCode", "bookOrder", "chapter", "id", "text", "translation", "verse") SELECT "book", "bookCode", "bookOrder", "chapter", "id", "text", "translation", "verse" FROM "BibleVerse";
DROP TABLE "BibleVerse";
ALTER TABLE "new_BibleVerse" RENAME TO "BibleVerse";
CREATE INDEX "BibleVerse_translation_book_chapter_verse_idx" ON "BibleVerse"("translation", "book", "chapter", "verse");
CREATE INDEX "BibleVerse_translation_bookOrder_chapter_idx" ON "BibleVerse"("translation", "bookOrder", "chapter");
CREATE UNIQUE INDEX "BibleVerse_translation_bookOrder_chapter_verse_key" ON "BibleVerse"("translation", "bookOrder", "chapter", "verse");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BibleFootnote_translation_book_chapter_verse_idx" ON "BibleFootnote"("translation", "book", "chapter", "verse");

-- CreateIndex
CREATE INDEX "BibleFootnote_translation_bookOrder_chapter_verse_idx" ON "BibleFootnote"("translation", "bookOrder", "chapter", "verse");
