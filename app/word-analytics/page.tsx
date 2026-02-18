"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { parseJsonSafe } from "@/lib/study-client-utils";

type SourceMode = "auto" | "ugnt" | "uhb";

type WordAnalyticsResponse = {
  query: {
    input: string;
    resolvedStrong: string;
    resolvedLemma: string;
    sourceTranslation: "ugnt" | "uhb";
  };
  lexicon: {
    lemma: string;
    translit: string | null;
    strongsDef: string | null;
    kjvDef: string | null;
  };
  bookStats: Array<{
    book: string;
    bookOrder: number;
    count: number;
    firstReference: string;
    lastReference: string;
  }>;
  occurrences: {
    book: string | null;
    page: number;
    pageSize: number;
    total: number;
    items: Array<{
      reference: string;
      chapter: number;
      verse: number;
      position: number;
      chapterPath: string | null;
    }>;
  };
};

function sourceLabel(value: "ugnt" | "uhb") {
  return value === "ugnt" ? "Greek NT" : "Hebrew OT";
}

function WordAnalyticsPageContent() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const [queryInput, setQueryInput] = useState("");
  const [sourceMode, setSourceMode] = useState<SourceMode>("auto");
  const [selectedBook, setSelectedBook] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WordAnalyticsResponse | null>(null);

  const totalPages = useMemo(() => {
    if (!data) {
      return 1;
    }
    return Math.max(1, Math.ceil(data.occurrences.total / data.occurrences.pageSize));
  }, [data]);

  const syncUrl = useCallback(
    (input: {
      query: string;
      sourceMode: SourceMode;
      book: string | null;
      page: number;
    }) => {
      const params = new URLSearchParams();
      if (input.query) {
        params.set("query", input.query);
      }
      if (input.sourceMode !== "auto") {
        params.set("sourceTranslation", input.sourceMode);
      }
      if (input.book) {
        params.set("book", input.book);
      }
      if (input.page > 1) {
        params.set("page", String(input.page));
      }
      const nextUrl = params.toString()
        ? `${pathname}?${params.toString()}`
        : pathname;
      window.history.replaceState(null, "", nextUrl);
    },
    [pathname]
  );

  const runSearch = useCallback(
    async (input: {
      query: string;
      sourceMode: SourceMode;
      book?: string | null;
      page?: number;
      skipUrlSync?: boolean;
    }) => {
      const normalizedQuery = input.query.trim();
      if (!normalizedQuery) {
        return;
      }

      setIsLoading(true);
      setError(null);
      const nextPage = input.page ?? 1;
      const response = await fetch("/api/word-analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: normalizedQuery,
          sourceTranslation: input.sourceMode === "auto" ? undefined : input.sourceMode,
          book: input.book ?? undefined,
          page: nextPage,
          pageSize
        })
      });

      const payload = (await parseJsonSafe(response)) as
        | WordAnalyticsResponse
        | { error: string };

      if (!response.ok || "error" in payload) {
        setData(null);
        setError("error" in payload ? payload.error : "Unable to load word analytics.");
        setIsLoading(false);
        return;
      }

      setData(payload);
      setSelectedBook(payload.occurrences.book);
      setPage(payload.occurrences.page);
      setQueryInput(payload.query.input);
      if (input.sourceMode === "auto") {
        setSourceMode("auto");
      } else {
        setSourceMode(payload.query.sourceTranslation);
      }

      if (!input.skipUrlSync) {
        syncUrl({
          query: payload.query.input,
          sourceMode: input.sourceMode,
          book: payload.occurrences.book,
          page: payload.occurrences.page
        });
      }

      setIsLoading(false);
    },
    [pageSize, syncUrl]
  );

  useEffect(() => {
    const strong = searchParams.get("strong");
    const lemma = searchParams.get("lemma");
    const query = searchParams.get("query") ?? strong ?? lemma ?? "";
    const source = searchParams.get("sourceTranslation");
    const book = searchParams.get("book");
    const urlPage = Number(searchParams.get("page") ?? "1");
    const parsedPage = Number.isFinite(urlPage) && urlPage > 0 ? urlPage : 1;
    const mode: SourceMode =
      source === "ugnt" || source === "uhb" ? (source as SourceMode) : "auto";

    setQueryInput(query);
    setSourceMode(mode);
    setSelectedBook(book);
    setPage(parsedPage);

    if (!query) {
      setData(null);
      setError(null);
      return;
    }

    void runSearch({
      query,
      sourceMode: mode,
      book,
      page: parsedPage,
      skipUrlSync: true
    });
  }, [runSearch, searchParams]);

  const canSubmit = queryInput.trim().length > 0 && !isLoading;
  return (
    <section className="grid">
      <article className="card">
        <div className="studyTopHeader">
          <h1>Word Analytics</h1>
        </div>
        <p className="muted">
          Search a lemma/Strong code and study where it appears across Scripture.
        </p>
        <form
          className="wordAnalyticsSearch"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch({
              query: queryInput,
              sourceMode,
              book: null,
              page: 1
            });
          }}
        >
          <input
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="G3056 or logos"
          />
          <select
            value={sourceMode}
            onChange={(event) => setSourceMode(event.target.value as SourceMode)}
          >
            <option value="auto">Auto</option>
            <option value="ugnt">Greek NT</option>
            <option value="uhb">Hebrew OT</option>
          </select>
          <button type="submit" disabled={!canSubmit}>
            {isLoading ? "Loading..." : "Search"}
          </button>
        </form>
        {error ? <p className="muted">{error}</p> : null}
      </article>

      {data ? (
        <>
          <article className="card wordAnalyticsSummary">
            <h2>Resolved lemma</h2>
            <p>
              <strong>Strong:</strong> {data.query.resolvedStrong}
            </p>
            <p>
              <strong>Lemma:</strong> {data.lexicon.lemma}
            </p>
            <p>
              <strong>Transliteration:</strong> {data.lexicon.translit ?? "-"}
            </p>
            <p>
              <strong>Corpus:</strong> {sourceLabel(data.query.sourceTranslation)}
            </p>
            <p>
              <strong>Strong definition:</strong> {data.lexicon.strongsDef ?? "-"}
            </p>
            <p>
              <strong>KJV glossary:</strong> {data.lexicon.kjvDef ?? "-"}
            </p>
          </article>

          <div className="wordAnalyticsLayout">
            <article className="card">
              <h2>Book stats</h2>
              <div className="wordAnalyticsTableWrap">
                <table className="wordAnalyticsTable">
                  <thead>
                    <tr>
                      <th>Book</th>
                      <th>Count</th>
                      <th>First</th>
                      <th>Last</th>
                      <th>View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.bookStats.map((item) => (
                      <tr key={item.book}>
                        <td>{item.book}</td>
                        <td>{item.count}</td>
                        <td>{item.firstReference}</td>
                        <td>{item.lastReference}</td>
                        <td>
                          <button
                            type="button"
                            className="linkButton"
                            disabled={isLoading}
                            onClick={() =>
                              void runSearch({
                                query: data.query.input,
                                sourceMode,
                                book: item.book,
                                page: 1
                              })
                            }
                          >
                            {selectedBook === item.book ? "Viewing" : "View"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="card">
              <h2>
                Occurrences
                {data.occurrences.book ? ` in ${data.occurrences.book}` : ""}
              </h2>
              <p className="muted">
                {data.occurrences.total} total matches, page {page} of {totalPages}
              </p>
              <div className="wordAnalyticsOccurrenceList">
                {data.occurrences.items.map((item) => (
                  <div className="wordAnalyticsOccurrenceItem" key={`${item.reference}-${item.position}`}>
                    <span>
                      {item.reference} (position {item.position})
                    </span>
                    {item.chapterPath ? (
                      <a href={item.chapterPath}>Open passage</a>
                    ) : (
                      <span className="muted">Open unavailable</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="wordAnalyticsPager">
                <button
                  type="button"
                  className="linkButton"
                  disabled={page <= 1 || isLoading}
                  onClick={() =>
                    void runSearch({
                      query: data.query.input,
                      sourceMode,
                      book: data.occurrences.book,
                      page: Math.max(1, page - 1)
                    })
                  }
                >
                  {"<- Prev"}
                </button>
                <button
                  type="button"
                  className="linkButton"
                  disabled={page >= totalPages || isLoading}
                  onClick={() =>
                    void runSearch({
                      query: data.query.input,
                      sourceMode,
                      book: data.occurrences.book,
                      page: page + 1
                    })
                  }
                >
                  {"Next ->"}
                </button>
              </div>
            </article>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default function WordAnalyticsPage() {
  return (
    <Suspense fallback={<section className="grid" />}>
      <WordAnalyticsPageContent />
    </Suspense>
  );
}
