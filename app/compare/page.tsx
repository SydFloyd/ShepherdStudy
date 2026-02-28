"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  BIBLE_TRANSLATIONS,
  BibleTranslationId,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { parseJsonSafe } from "@/lib/study-client-utils";
import { DiffSegment } from "@/lib/text-diff";

type CompareResponse = {
  reference: string;
  previousReference: string | null;
  nextReference: string | null;
  left: {
    translation: string;
    translationName: string;
    text: string;
    segments: DiffSegment[];
  };
  right: {
    translation: string;
    translationName: string;
    text: string;
    segments: DiffSegment[];
  };
};

const DEFAULT_REFERENCE = "John 1";

function DiffText({ segments }: { segments: DiffSegment[] }) {
  return (
    <p className="compareText paragraphText">
      {segments.map((segment, index) => (
        <span key={`${segment.type}-${index}`} className={`diffToken ${segment.type}`}>
          {segment.text}
        </span>
      ))}
    </p>
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

  const canSubmit = useMemo(() => !isLoading, [isLoading]);

  const runCompare = useCallback(async (input: {
    reference: string;
    left: BibleTranslationId;
    right: BibleTranslationId;
  }) => {
    setIsLoading(true);
    setError(null);

    const response = await fetch("/api/verse-compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      setError("error" in payload ? payload.error : "Unable to compare verses.");
      setIsLoading(false);
      return;
    }

    setData(payload);
    setActiveReference(payload.reference);
    setIsLoading(false);
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
        <div className="studyTopHeader">
          <h1>Translation Comparison</h1>
        </div>
        <p className="muted">
          Compare a verse or full chapter across translations with highlighted
          text differences.
        </p>
        <form className="compareForm" onSubmit={submit}>
          <input
            value={referenceInput}
            onChange={(event) => setReferenceInput(event.target.value)}
            placeholder="John 1"
          />
          <button type="submit" disabled={!canSubmit}>
            {isLoading ? "Comparing..." : "Compare"}
          </button>
        </form>
        {error ? <p className="muted">{error}</p> : null}
      </article>

      {data ? (
        <article className="card">
          <h2>{data.reference}</h2>
          <div className="compareGrid">
            <section className="comparePanel">
              <div className="comparePanelHeader">
                <select
                  value={leftTranslation}
                  onChange={(event) => {
                    const next = event.target.value as BibleTranslationId;
                    setLeftTranslation(next);
                    void runCompare({
                      reference: activeReference,
                      left: next,
                      right: rightTranslation
                    });
                  }}
                  disabled={isLoading}
                >
                  {BIBLE_TRANSLATIONS.map((item) => (
                    <option key={`left-${item.value}`} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <DiffText segments={data.left.segments} />
            </section>
            <section className="comparePanel">
              <div className="comparePanelHeader">
                <select
                  value={rightTranslation}
                  onChange={(event) => {
                    const next = event.target.value as BibleTranslationId;
                    setRightTranslation(next);
                    void runCompare({
                      reference: activeReference,
                      left: leftTranslation,
                      right: next
                    });
                  }}
                  disabled={isLoading}
                >
                  {BIBLE_TRANSLATIONS.map((item) => (
                    <option key={`right-${item.value}`} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <DiffText segments={data.right.segments} />
            </section>
          </div>
          <div className="compareNavRow">
            <div>
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
            <div>
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
        </article>
      ) : null}
    </section>
  );
}
