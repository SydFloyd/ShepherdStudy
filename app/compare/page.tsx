"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ScriptureAttribution } from "@/components/scripture-attribution";
import { TranslationPicker } from "@/components/translation-picker";
import {
  BibleSourceInfo,
  BibleTranslationId,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { parseJsonSafe } from "@/lib/study-client-utils";
import { buildLinkedSideBySideDiff } from "@/lib/text-diff";
import type { LinkedDiffSegment } from "@/lib/text-diff";

type CompareResponse = {
  reference: string;
  previousReference: string | null;
  nextReference: string | null;
  left: {
    translation: string;
    translationName: string;
    source: BibleSourceInfo;
    verses: Array<{
      verse: number;
      paragraph: number;
      text: string;
    }>;
  };
  right: {
    translation: string;
    translationName: string;
    source: BibleSourceInfo;
    verses: Array<{
      verse: number;
      paragraph: number;
      text: string;
    }>;
  };
};

const DEFAULT_REFERENCE = "John 1:1-5";

type ComputedVerseDiff = {
  verse: number;
  paragraph: number;
  segments: LinkedDiffSegment[];
};

function DiffText(input: {
  verse: number;
  segments: LinkedDiffSegment[];
  hoveredTokenKey: string | null;
  onHoverToken: (tokenKey: string | null) => void;
}) {
  function buildTokenKey(groupId: number) {
    return `${input.verse}:${groupId}`;
  }

  if (input.segments.length === 0) {
    const isTokenHoveredInVerse = input.hoveredTokenKey?.startsWith(
      `${input.verse}:`
    );
    return (
      <span
        className={`muted compareMissingVerse${
          isTokenHoveredInVerse ? " is-token-hovered" : ""
        }`}
      >
        -
      </span>
    );
  }

  return (
    <>
      {input.segments.map((segment, index) => (
        <span
          key={`${segment.type}-${segment.groupId}-${index}`}
          className={`diffToken ${segment.type}${
            input.hoveredTokenKey === buildTokenKey(segment.groupId)
              ? " tokenHover"
              : ""
          }`}
          onMouseEnter={() => input.onHoverToken(buildTokenKey(segment.groupId))}
          onMouseLeave={() => input.onHoverToken(null)}
        >
          {segment.text}
        </span>
      ))}
    </>
  );
}

function DiffVerseParagraphs(input: {
  verses: ComputedVerseDiff[];
  side: "left" | "right";
  hoveredVerse: number | null;
  onHoverVerse: (verse: number | null) => void;
  hoveredTokenKey: string | null;
  onHoverToken: (tokenKey: string | null) => void;
  source: BibleSourceInfo;
}) {
  const paragraphGroups = input.verses.reduce<
    Array<{
      paragraph: number;
      verses: typeof input.verses;
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
    <div
      className="paragraphList compareParagraphList scriptureText"
      dir={input.source.direction}
      lang={input.source.languageIso}
      onMouseLeave={() => {
        input.onHoverVerse(null);
        input.onHoverToken(null);
      }}
    >
      {paragraphGroups.map((group) => (
        <p key={`${input.side}-p-${group.paragraph}`} className="paragraphText compareText">
          {group.verses.map((verseRow) => (
            <span
              key={`${input.side}-${verseRow.verse}`}
              className={`verseInline compareVerseInline${
                input.hoveredVerse === verseRow.verse ? " is-hovered" : ""
              }`}
              onMouseEnter={() => input.onHoverVerse(verseRow.verse)}
              onFocus={() => input.onHoverVerse(verseRow.verse)}
              onBlur={() => input.onHoverVerse(null)}
              tabIndex={0}
            >
              <span className="verseNumber">{verseRow.verse}</span>
              {" "}
              <DiffText
                verse={verseRow.verse}
                segments={verseRow.segments}
                hoveredTokenKey={input.hoveredTokenKey}
                onHoverToken={input.onHoverToken}
              />
              {" "}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}

export default function ComparePage() {
  const [referenceInput, setReferenceInput] = useState("");
  const [activeReference, setActiveReference] = useState(DEFAULT_REFERENCE);
  const [leftTranslation, setLeftTranslation] = useState<BibleTranslationId>(
    DEFAULT_BIBLE_TRANSLATION
  );
  const [rightTranslation, setRightTranslation] = useState<BibleTranslationId>("kjv");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [hoveredVerse, setHoveredVerse] = useState<number | null>(null);
  const [hoveredTokenKey, setHoveredTokenKey] = useState<string | null>(null);

  const canSubmit = useMemo(() => !isLoading, [isLoading]);
  const computedDiffBySide = useMemo<{
    left: ComputedVerseDiff[];
    right: ComputedVerseDiff[];
  }>(() => {
    if (!data) {
      return {
        left: [],
        right: []
      };
    }

    const leftTextByVerse = new Map(data.left.verses.map((item) => [item.verse, item.text]));
    const rightTextByVerse = new Map(data.right.verses.map((item) => [item.verse, item.text]));
    const verseNumbers = Array.from(
      new Set([...leftTextByVerse.keys(), ...rightTextByVerse.keys()])
    ).sort((a, b) => a - b);

    const leftSegmentsByVerse = new Map<number, LinkedDiffSegment[]>();
    const rightSegmentsByVerse = new Map<number, LinkedDiffSegment[]>();

    for (const verse of verseNumbers) {
      const diff = buildLinkedSideBySideDiff({
        leftText: leftTextByVerse.get(verse) ?? "",
        rightText: rightTextByVerse.get(verse) ?? ""
      });
      leftSegmentsByVerse.set(verse, diff.left);
      rightSegmentsByVerse.set(verse, diff.right);
    }

    return {
      left: data.left.verses.map((item) => ({
        verse: item.verse,
        paragraph: item.paragraph,
        segments: leftSegmentsByVerse.get(item.verse) ?? []
      })),
      right: data.right.verses.map((item) => ({
        verse: item.verse,
        paragraph: item.paragraph,
        segments: rightSegmentsByVerse.get(item.verse) ?? []
      }))
    };
  }, [data]);

  const runCompare = useCallback(async (input: {
    reference: string;
    left: BibleTranslationId;
    right: BibleTranslationId;
  }) => {
    setIsLoading(true);
    setError(null);
    setHoveredVerse(null);
    setHoveredTokenKey(null);

    try {
      const response = await fetch("/api/verse-compare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-source-route": "/compare"
        },
        body: JSON.stringify({
          reference: input.reference,
          leftTranslation: input.left,
          rightTranslation: input.right
        })
      });

      const payload = (await parseJsonSafe(response)) as
        | CompareResponse
        | { error: string };
      if (!response.ok || "error" in payload) {
        setError(
          "error" in payload ? payload.error : "Unable to compare verses."
        );
        return;
      }

      setData(payload);
      setActiveReference(payload.reference);
      setLeftTranslation(payload.left.translation as BibleTranslationId);
      setRightTranslation(payload.right.translation as BibleTranslationId);
    } catch {
      setError("Unable to compare verses.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void runCompare({
      reference: DEFAULT_REFERENCE,
      left: DEFAULT_BIBLE_TRANSLATION,
      right: "kjv"
    });
  }, [runCompare]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const targetReference = referenceInput.trim() || activeReference || DEFAULT_REFERENCE;
    await runCompare({
      reference: targetReference,
      left: leftTranslation,
      right: rightTranslation
    });
  }

  async function navigateTo(reference: string | null) {
    if (!reference || isLoading) {
      return;
    }
    await runCompare({
      reference,
      left: leftTranslation,
      right: rightTranslation
    });
  }

  return (
    <section className="grid">
      <article className="card">
        <div className="compareTopHeader">
          <h1>Translation Comparison</h1>
          <form className="compareForm" onSubmit={submit}>
            <input
              value={referenceInput}
              onChange={(event) => setReferenceInput(event.target.value)}
              placeholder="John 1:1-5"
            />
            <button type="submit" disabled={!canSubmit}>
              {isLoading ? "Comparing..." : "Compare"}
            </button>
          </form>
        </div>
        {error ? (
          <p className="muted" role="alert">
            {error}
          </p>
        ) : null}
      </article>

      {data ? (
        <article className="card">
          <div className="compareNavHeaderRow">
            <div className="compareNavControl compareNavControlLeft">
              <button
                type="button"
                className="linkButton"
                disabled={!data.previousReference || isLoading}
                onClick={() => void navigateTo(data.previousReference)}
              >
                {"<- Prev"}
              </button>
              <p className="muted compareNavRef">
                {data.previousReference ?? "\u00a0"}
              </p>
            </div>
            <h2 className="compareNavTitle">{data.reference}</h2>
            <div className="compareNavControl compareNavControlRight">
              <button
                type="button"
                className="linkButton"
                disabled={!data.nextReference || isLoading}
                onClick={() => void navigateTo(data.nextReference)}
              >
                {"Next ->"}
              </button>
              <p className="muted compareNavRef">
                {data.nextReference ?? "\u00a0"}
              </p>
            </div>
          </div>
          <div className="compareGrid">
            <section className="comparePanel">
              <div className="comparePanelHeader">
                <TranslationPicker
                  id="compare-left-translation"
                  label="Left translation"
                  value={leftTranslation}
                  onChange={(next) => {
                    void runCompare({
                      reference: activeReference,
                      left: next,
                      right: rightTranslation
                    });
                  }}
                  disabled={isLoading}
                />
              </div>
              <DiffVerseParagraphs
                verses={computedDiffBySide.left}
                side="left"
                hoveredVerse={hoveredVerse}
                onHoverVerse={setHoveredVerse}
                hoveredTokenKey={hoveredTokenKey}
                onHoverToken={setHoveredTokenKey}
                source={data.left.source}
              />
              <ScriptureAttribution source={data.left.source} />
            </section>
            <section className="comparePanel">
              <div className="comparePanelHeader">
                <TranslationPicker
                  id="compare-right-translation"
                  label="Right translation"
                  value={rightTranslation}
                  onChange={(next) => {
                    void runCompare({
                      reference: activeReference,
                      left: leftTranslation,
                      right: next
                    });
                  }}
                  disabled={isLoading}
                />
              </div>
              <DiffVerseParagraphs
                verses={computedDiffBySide.right}
                side="right"
                hoveredVerse={hoveredVerse}
                onHoverVerse={setHoveredVerse}
                hoveredTokenKey={hoveredTokenKey}
                onHoverToken={setHoveredTokenKey}
                source={data.right.source}
              />
              <ScriptureAttribution source={data.right.source} />
            </section>
          </div>
        </article>
      ) : null}
    </section>
  );
}
