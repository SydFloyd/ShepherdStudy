"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  BIBLE_TRANSLATIONS,
  BibleTranslationId,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { parseJsonSafe } from "@/lib/study-client-utils";

type WordLensRow = {
  position: number;
  original: string;
  aiTranslation: string;
  transliteration: string;
  note: string;
  lemma: string | null;
  strong: string | null;
  strongNormalized: string | null;
  strongsDef: string;
  kjvDef: string;
  morph: string | null;
  partOfSpeech: string;
  type: string;
  gender: string;
  number: string;
  state: string;
  long: string;
};

type WordLensResponse = {
  reference: string;
  chapterReference: string;
  translation: string;
  translationName: string;
  selectedVerse: {
    verse: number;
    text: string;
  };
  sourceTranslation: string;
  sourceTranslationName: string;
  sourceText: string;
  rows: WordLensRow[];
  notice: string | null;
  previousReference: string | null;
  nextReference: string | null;
};

const DEFAULT_WORD_LENS_REFERENCE = "Genesis 1:1";

function buildWordAnalyticsHref(
  row: WordLensRow,
  sourceTranslation: string
): string | null {
  if (row.strongNormalized) {
    return `/word-analytics?strong=${encodeURIComponent(row.strongNormalized)}`;
  }
  if (row.lemma) {
    return `/word-analytics?lemma=${encodeURIComponent(row.lemma)}&sourceTranslation=${encodeURIComponent(
      sourceTranslation
    )}`;
  }
  return null;
}

function toTitleCase(input: string) {
  return input
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeToken(input: string) {
  return input.trim().toLowerCase().replace(/[_\s-]+/g, "");
}

function formatMorphField(
  field: "partOfSpeech" | "type" | "gender" | "number" | "state",
  value: string
) {
  const raw = value.trim();
  if (!raw) {
    return "-";
  }

  const token = normalizeToken(raw);
  const dictionaries: Record<string, Record<string, string>> = {
    partOfSpeech: {
      n: "Noun",
      noun: "Noun",
      v: "Verb",
      verb: "Verb",
      adj: "Adjective",
      adjective: "Adjective",
      adv: "Adverb",
      adverb: "Adverb",
      prep: "Preposition",
      preposition: "Preposition",
      pron: "Pronoun",
      pronoun: "Pronoun",
      conj: "Conjunction",
      conjunction: "Conjunction",
      art: "Article",
      article: "Article",
      interj: "Interjection",
      interjection: "Interjection",
      part: "Particle",
      particle: "Particle"
    },
    type: {
      proper: "Proper",
      common: "Common",
      personal: "Personal",
      demonstrative: "Demonstrative",
      relative: "Relative",
      interrogative: "Interrogative",
      infinitive: "Infinitive",
      participle: "Participle",
      imperative: "Imperative"
    },
    gender: {
      m: "Masculine",
      masc: "Masculine",
      masculine: "Masculine",
      f: "Feminine",
      fem: "Feminine",
      feminine: "Feminine",
      n: "Neuter",
      neut: "Neuter",
      neuter: "Neuter",
      c: "Common",
      common: "Common"
    },
    number: {
      s: "Singular",
      sg: "Singular",
      singular: "Singular",
      p: "Plural",
      pl: "Plural",
      plural: "Plural",
      d: "Dual",
      dual: "Dual"
    },
    state: {
      abs: "Absolute",
      absolute: "Absolute",
      construct: "Construct",
      cstr: "Construct",
      emphatic: "Emphatic",
      emph: "Emphatic",
      determined: "Determined",
      indeterminate: "Indeterminate"
    }
  };

  const mapped = dictionaries[field][token];
  if (mapped) {
    return mapped;
  }

  return toTitleCase(raw.replace(/[_-]+/g, " "));
}

export default function WordLensPage() {
  const [referenceInput, setReferenceInput] = useState("");
  const [translation, setTranslation] = useState<BibleTranslationId>(
    DEFAULT_BIBLE_TRANSLATION
  );
  const [data, setData] = useState<WordLensResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [hoveredWordPosition, setHoveredWordPosition] = useState<number | null>(
    null
  );
  const autoLoadedRef = useRef(false);

  const versionSelectWidthCh =
    Math.max(...BIBLE_TRANSLATIONS.map((item) => item.label.length), 8) + 2;

  const canSubmit = useMemo(
    () => referenceInput.trim().length > 0 && !isLoading,
    [referenceInput, isLoading]
  );

  async function fetchLens(
    reference: string,
    nextTranslation = translation,
    options?: { syncInput?: boolean }
  ) {
    setIsLoading(true);
    setError(null);

    const response = await fetch("/api/word-lens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        translation: nextTranslation
      })
    });

    const payload = (await parseJsonSafe(response)) as
      | WordLensResponse
      | { error: string };

    if (!response.ok || "error" in payload) {
      setData(null);
      const nextError = "error" in payload ? payload.error : "Unable to load word lens.";
      setError(nextError);
      setIsLoading(false);
      return;
    }

    setData(payload);
    if (options?.syncInput !== false) {
      setReferenceInput(payload.reference);
    }
    setTranslation(payload.translation as BibleTranslationId);
    setExpandedRows({});
    setHoveredWordPosition(null);
    setIsLoading(false);
  }

  useEffect(() => {
    if (autoLoadedRef.current) {
      return;
    }
    autoLoadedRef.current = true;
    void fetchLens(DEFAULT_WORD_LENS_REFERENCE, translation, { syncInput: false });
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reference = referenceInput.trim();
    if (!reference) {
      return;
    }
    await fetchLens(reference);
  }

  async function onTranslationChange(nextTranslation: BibleTranslationId) {
    if (isLoading) {
      return;
    }
    setTranslation(nextTranslation);
    if (!data) {
      const targetReference = referenceInput.trim();
      if (targetReference) {
        await fetchLens(targetReference, nextTranslation);
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    const response = await fetch("/api/word-lens/map", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: data.reference,
        translation: nextTranslation
      })
    });

    const payload = (await parseJsonSafe(response)) as
      | {
          reference: string;
          translation: string;
          translationName: string;
          selectedVerse: { verse: number; text: string };
          rows: Array<{ position: number; aiTranslation: string }>;
          error?: undefined;
        }
      | { error: string };

    if (!response.ok || "error" in payload) {
      const nextError =
        ("error" in payload ? payload.error : null) ||
        "Unable to update translation.";
      setError(nextError);
      setIsLoading(false);
      return;
    }

    const mapByPosition = new Map(
      payload.rows.map((row) => [row.position, row.aiTranslation])
    );
    setData((current) =>
      current
        ? {
            ...current,
            translation: payload.translation,
            translationName: payload.translationName,
            selectedVerse: {
              ...current.selectedVerse,
              text: payload.selectedVerse.text
            },
            rows: current.rows.map((row) => ({
              ...row,
              aiTranslation: mapByPosition.get(row.position) ?? row.aiTranslation
            }))
          }
        : current
    );
    setIsLoading(false);
  }

  return (
    <section className="grid">
      <article className="card">
        <div className="studyTopHeader">
          <h1>Interlinear</h1>
        </div>
        <div className="wordLensTopRow">
          <p className="muted">
            Analyze one verse at a time in the original language with lexical
            and morphology support.
          </p>
          <form className="wordLensSearchForm" onSubmit={onSubmit}>
            <input
              value={referenceInput}
              onChange={(event) => setReferenceInput(event.target.value)}
              placeholder="Genesis 1:1"
            />
            <button type="submit" disabled={!canSubmit}>
              {isLoading ? "Loading..." : "Analyze"}
            </button>
          </form>
        </div>
        {error ? <p className="muted">{error}</p> : null}
      </article>

      {data ? (
        <article className="card wordLensCard">
          <div className="wordLensHeader">
            <h2>{data.reference}</h2>
            <div className="wordLensNav">
              <button
                type="button"
                className="linkButton"
                disabled={!data.previousReference || isLoading}
                onClick={() => {
                  if (data.previousReference) {
                    void fetchLens(data.previousReference);
                  }
                }}
              >
                {"<- Prev"}
              </button>
              <button
                type="button"
                className="linkButton"
                disabled={!data.nextReference || isLoading}
                onClick={() => {
                  if (data.nextReference) {
                    void fetchLens(data.nextReference);
                  }
                }}
              >
                {"Next ->"}
              </button>
            </div>
          </div>
          {data.notice ? <p className="muted">{data.notice}</p> : null}

          <section className="wordLensVerseBlock">
            <p
              className={`wordLensOriginalText paragraphText${
                data.sourceTranslation === "uhb" ? " rtl" : ""
              }`}
            >
              {data.rows.length > 0
                ? data.rows.map((row, index) => (
                    <span
                      key={row.position}
                      className={`wordLensOriginalToken${
                        hoveredWordPosition === row.position ? " hovered" : ""
                      }`}
                    >
                      {row.original}
                      {index < data.rows.length - 1 ? " " : ""}
                    </span>
                  ))
                : data.sourceText}
            </p>
            <p
              className={`muted wordLensSourceLabel${
                data.sourceTranslation === "uhb" ? " rtl" : ""
              }`}
            >
              {data.sourceTranslationName} (original)
            </p>
            <p
              key={`${data.reference}-${data.translation}`}
              className="wordLensTranslationText"
            >
              {data.selectedVerse.text}
            </p>
            <p className="muted wordLensTranslationLabel">
              <label className="wordLensVersionField">
                Version
                <select
                  value={(data?.translation as BibleTranslationId) ?? translation}
                  onChange={(event) =>
                    void onTranslationChange(event.target.value as BibleTranslationId)
                  }
                  style={{
                    width: `calc(${versionSelectWidthCh}ch + 2.5rem)`,
                    maxWidth: "100%"
                  }}
                >
                  {BIBLE_TRANSLATIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </p>
          </section>

          <div className="wordLensTableWrap">
            <table className="wordLensTable">
              <thead>
                <tr>
                  <th>AI translation</th>
                  <th>Original</th>
                  <th>Transliteration</th>
                  <th className="wordLensNoteCol">AI note</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const expanded = Boolean(expandedRows[row.position]);
                  const analyticsHref = buildWordAnalyticsHref(
                    row,
                    data.sourceTranslation
                  );
                  return (
                    <Fragment key={row.position}>
                      <tr
                        className="wordLensRow"
                        onMouseEnter={() => setHoveredWordPosition(row.position)}
                        onMouseLeave={() => setHoveredWordPosition(null)}
                        onClick={() =>
                          setExpandedRows((current) => ({
                            ...current,
                            [row.position]: !expanded
                          }))
                        }
                      >
                        <td>{row.aiTranslation || "-"}</td>
                        <td>
                          <span>{row.original}</span>
                        </td>
                        <td>{row.transliteration || "-"}</td>
                        <td className="wordLensNoteCol">{row.note || ""}</td>
                      </tr>
                      {expanded ? (
                        <tr className="wordLensDetails">
                          <td colSpan={4}>
                            <div className="wordLensDetailsGrid">
                              <div className="wordLensDetailsCol">
                                <p>
                                  <strong>Lemma:</strong>{" "}
                                  {row.lemma ? (
                                    <a
                                      href={`/word-analytics?lemma=${encodeURIComponent(row.lemma)}&sourceTranslation=${encodeURIComponent(
                                        data.sourceTranslation
                                      )}`}
                                    >
                                      {row.lemma}
                                    </a>
                                  ) : (
                                    "-"
                                  )}
                                </p>
                                <p>
                                  <strong>Strong:</strong> {row.strong || "-"}
                                </p>
                                <p>
                                  <strong>Strong (normalized):</strong>{" "}
                                  {row.strongNormalized ? (
                                    <a
                                      href={`/word-analytics?strong=${encodeURIComponent(
                                        row.strongNormalized
                                      )}`}
                                    >
                                      {row.strongNormalized}
                                    </a>
                                  ) : (
                                    "-"
                                  )}
                                </p>
                                <p>
                                  <strong>Morph:</strong> {row.morph || "-"}
                                </p>
                                <p>
                                  <strong>Part of speech:</strong>{" "}
                                  {formatMorphField("partOfSpeech", row.partOfSpeech)}
                                </p>
                                <p>
                                  <strong>Type:</strong> {formatMorphField("type", row.type)}
                                </p>
                                <p>
                                  <strong>Gender:</strong> {formatMorphField("gender", row.gender)}
                                </p>
                                <p>
                                  <strong>Number:</strong> {formatMorphField("number", row.number)}
                                </p>
                                <p>
                                  <strong>State:</strong> {formatMorphField("state", row.state)}
                                </p>
                                <p>
                                  <strong>Long:</strong> {row.long || "-"}
                                </p>
                              </div>
                              <div className="wordLensDetailsCol wordLensDetailsColWide">
                                <p>
                                  <strong>Strong definition:</strong>{" "}
                                  {row.strongsDef || "-"}
                                </p>
                                <p>
                                  <strong>KJV glossary:</strong> {row.kjvDef || "-"}
                                </p>
                                <p className="wordLensNoteDetail">
                                  <strong>AI note:</strong> {row.note || "-"}
                                </p>
                                {analyticsHref ? (
                                  <div className="wordLensDetailsActionRow">
                                    <a
                                      href={analyticsHref}
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      View word analytics
                                    </a>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}
    </section>
  );
}
