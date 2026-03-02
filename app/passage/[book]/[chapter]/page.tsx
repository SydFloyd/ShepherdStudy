import Link from "next/link";

import { PassageVersionSelect } from "@/components/passage-version-select";
import {
  DEFAULT_BIBLE_TRANSLATION,
  isRtlTranslation,
  resolveBibleBookCandidates
} from "@/lib/bible";
import { getChapterFromLocalBible } from "@/lib/local-bible";
import {
  buildPassagePath,
  isSameBook,
  parseBookSlug,
  parseScriptureReference
} from "@/lib/scripture";

type PageProps = {
  params: Promise<{
    book: string;
    chapter: string;
  }>;
  searchParams: Promise<{
    ref?: string | string[];
    translation?: string | string[];
  }>;
};

function firstQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function replaceBookInReference(
  originalRef: string,
  candidateBook: string
): string {
  const parsed = parseScriptureReference(originalRef);
  if (!parsed) {
    return originalRef;
  }

  return originalRef.replace(parsed.book, candidateBook);
}

type ChapterFetchResult = {
  data: {
    reference: string;
    translationName: string;
    verses: Array<{
      verse: number;
      paragraph: number;
      text: string;
      notes: Array<{
        kind: "footnote" | "crossref";
        caller: string | null;
        text: string;
      }>;
    }>;
  } | null;
  resolvedBook?: string;
  error?: string;
};

async function getChapter(
  books: string[],
  chapter: number,
  translation: string
): Promise<ChapterFetchResult> {
  const chapterResult = await getChapterFromLocalBible({
    books,
    chapter,
    translation
  });

  if (!chapterResult.data) {
    return {
      data: null,
      error: chapterResult.error
    };
  }

  return {
    resolvedBook: chapterResult.resolvedBook,
    data: {
      reference: chapterResult.data.reference,
      translationName: chapterResult.data.translationName,
      verses: chapterResult.data.verses
    }
  };
}

export default async function PassagePage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const chapter = Number(resolvedParams.chapter);
  if (!Number.isInteger(chapter) || chapter < 1) {
    return (
      <section className="card">
        <h1>Invalid chapter</h1>
        <p className="muted">The chapter in this link is not valid.</p>
      </section>
    );
  }

  const book = parseBookSlug(resolvedParams.book);
  const ref = firstQueryValue(resolvedSearchParams.ref);
  const bookCandidates = resolveBibleBookCandidates(book);
  const queryBookCandidates = ref
    ? (() => {
        const parsedRef = parseScriptureReference(ref);
        return parsedRef ? resolveBibleBookCandidates(parsedRef.book) : [];
      })()
    : [];
  const allCandidates = Array.from(
    new Set([book, ...bookCandidates, ...queryBookCandidates])
  ).filter(Boolean);
  const translation =
    firstQueryValue(resolvedSearchParams.translation) ??
    DEFAULT_BIBLE_TRANSLATION;
  const chapterResult = await getChapter(allCandidates, chapter, translation);
  const chapterData = chapterResult.data;
  const highlightedBook = chapterResult.resolvedBook ?? book;
  const isRtl = isRtlTranslation(translation);

  if (!chapterData) {
    return (
      <section className="card">
        <h1>Passage unavailable</h1>
        <p className="muted">
          Could not load this chapter from the local Bible database.
        </p>
        {allCandidates.length > 1 ? (
          <div>
            <p>Did you mean one of these books?</p>
            <ul>
              {allCandidates.slice(0, 5).map((candidate) => {
                const candidateRef = ref
                  ? replaceBookInReference(ref, candidate)
                  : `${candidate} ${chapter}`;
                const path = buildPassagePath(candidateRef, translation);

                return (
                  <li key={candidate}>
                    {path ? (
                      <a href={path}>{candidate}</a>
                    ) : (
                      <span>{candidate}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {process.env.NODE_ENV !== "production" && chapterResult.error ? (
          <p className="muted">Debug: {chapterResult.error}</p>
        ) : null}
      </section>
    );
  }

  const selectedRef = ref ? parseScriptureReference(ref) : null;
  const highlightRange =
    selectedRef &&
    isSameBook(selectedRef.book, highlightedBook) &&
    selectedRef.chapter === chapter
      ? {
          start: selectedRef.verseStart ?? 1,
          end: selectedRef.verseEnd ?? selectedRef.verseStart ?? Number.MAX_SAFE_INTEGER
        }
      : null;

  const paragraphGroups = chapterData.verses.reduce<
    Array<{
      paragraph: number;
      verses: typeof chapterData.verses;
    }>
  >((groups, verse) => {
    const current = groups[groups.length - 1];
    if (!current || current.paragraph !== verse.paragraph) {
      groups.push({ paragraph: verse.paragraph, verses: [verse] });
    } else {
      current.verses.push(verse);
    }
    return groups;
  }, []);

  return (
    <section className="grid">
      <article className="card">
        <div className="passagePanelHeader">
          <h1>{chapterData.reference}</h1>
          <PassageVersionSelect currentValue={translation} />
        </div>
        <p>
          <Link href="/study">Back to study</Link>
        </p>
      </article>

      <article className="card">
        <h2>Chapter text</h2>
        <div
          className="paragraphList"
          dir={isRtl ? "rtl" : "ltr"}
          lang={isRtl ? "he" : undefined}
        >
          {paragraphGroups.map((group) => (
            <p className="paragraphText" key={group.paragraph}>
              {group.verses.map((verse) => {
                const inRange =
                  highlightRange &&
                  verse.verse >= highlightRange.start &&
                  verse.verse <= highlightRange.end;

                return (
                  <span
                    key={verse.verse}
                    className={inRange ? "verseInline highlightInline" : "verseInline"}
                  >
                    <span className="verseNumber">{verse.verse}</span>
                    <span>{verse.text.trim()}</span>
                    {verse.notes.length > 0 ? (
                      <sup className="noteCounter">{verse.notes.length}</sup>
                    ) : null}
                    {verse.notes.length > 0 ? (
                      <span className="verseNotes">
                        {verse.notes.map((note, index) => (
                          <span key={`${verse.verse}-${note.kind}-${index}`} className="noteItem">
                            [{note.kind === "crossref" ? "x" : "f"}
                            {note.caller ? ` ${note.caller}` : ""}] {note.text}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
      </article>
    </section>
  );
}
