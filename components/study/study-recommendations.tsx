"use client";

import { useEffect, useState } from "react";

import { ScriptureAttribution } from "@/components/scripture-attribution";
import type { BibleSourceInfo, BibleTranslationId } from "@/lib/bible";
import {
  buildPassagePreviewKey,
  fetchPassagePreviewCached
} from "@/lib/passage-preview-client";
import { buildPassagePath } from "@/lib/scripture";
import type { PassagePreviewPayload } from "@/lib/study-client-contract";
import { StudyRecommendation } from "@/lib/study-contract";
import { getStudySelectionTranslation } from "@/lib/study-translation";

const PREVIEW_CONCURRENCY = 3;

type PreviewTask = {
  key: string;
  reference: string;
  translation: BibleTranslationId;
};

type StoredPreview = {
  text: string;
  source?: BibleSourceInfo;
};

function getPreviewKey(
  index: number,
  reference: string,
  translation: BibleTranslationId
) {
  return `${index}:${buildPassagePreviewKey(reference, translation)}`;
}

function getStoredPreview(
  item: StudyRecommendation,
  selectionTranslation: BibleTranslationId
): StoredPreview | null {
  const snapshotTranslation = item.translation ?? item.source?.translation;
  const text = item.preview?.trim() ?? "";
  if (!text || snapshotTranslation !== selectionTranslation) {
    return null;
  }
  return { text, source: item.source };
}

async function fetchPreviewTasks(
  tasks: PreviewTask[]
): Promise<Array<[string, PassagePreviewPayload | null]>> {
  const entries = new Array<[string, PassagePreviewPayload | null]>(
    tasks.length
  );
  let cursor = 0;

  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      const task = tasks[index];
      const preview = await fetchPassagePreviewCached({
        reference: task.reference,
        translation: task.translation
      });
      entries[index] = [task.key, preview];
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(PREVIEW_CONCURRENCY, tasks.length) },
      () => worker()
    )
  );
  return entries;
}

type Props = {
  recommendations: StudyRecommendation[];
  translation: BibleTranslationId;
  isOpen?: boolean;
  onToggleOpen?: (open: boolean) => void;
  onPreviewRecommendation?: (reference: string, selectionTranslation?: string) => void;
};

export function StudyRecommendations({
  recommendations,
  translation,
  isOpen = true,
  onToggleOpen,
  onPreviewRecommendation
}: Props) {
  const [livePreviewByKey, setLivePreviewByKey] = useState<
    Record<string, PassagePreviewPayload | null>
  >({});

  useEffect(() => {
    let cancelled = false;

    async function loadLivePreviews() {
      if (recommendations.length === 0) {
        if (Object.keys(livePreviewByKey).length > 0) {
          setLivePreviewByKey({});
        }
        return;
      }
      if (!isOpen) {
        return;
      }

      const tasks = recommendations.flatMap((item, index): PreviewTask[] => {
        const selectionTranslation = getStudySelectionTranslation(
          item.reference,
          translation
        );
        const key = getPreviewKey(index, item.reference, selectionTranslation);
        if (
          getStoredPreview(item, selectionTranslation) ||
          Object.prototype.hasOwnProperty.call(livePreviewByKey, key)
        ) {
          return [];
        }
        return [
          {
            key,
            reference: item.reference,
            translation: selectionTranslation
          }
        ];
      });
      if (tasks.length === 0) {
        return;
      }

      const entries = await fetchPreviewTasks(tasks);

      if (cancelled) {
        return;
      }

      setLivePreviewByKey((current) => ({
        ...current,
        ...Object.fromEntries(entries)
      }));
    }

    void loadLivePreviews();

    return () => {
      cancelled = true;
    };
  }, [isOpen, livePreviewByKey, recommendations, translation]);

  const displayItems = recommendations.map((item, index) => {
    const selectionTranslation = getStudySelectionTranslation(
      item.reference,
      translation
    );
    const previewKey = getPreviewKey(
      index,
      item.reference,
      selectionTranslation
    );
    const storedPreview = getStoredPreview(item, selectionTranslation);
    const wasRequested = Object.prototype.hasOwnProperty.call(
      livePreviewByKey,
      previewKey
    );
    const livePreview = livePreviewByKey[previewKey] ?? null;
    const text =
      storedPreview?.text ?? livePreview?.verses[0]?.text?.trim() ?? "";
    const source = storedPreview?.source ?? livePreview?.source;

    return {
      item,
      index,
      selectionTranslation,
      passagePath: buildPassagePath(item.reference, selectionTranslation),
      text,
      source,
      wasRequested
    };
  });
  const displayedSources = Array.from(
    displayItems.reduce((sources, item) => {
      if (item.text && item.source) {
        sources.set(item.source.translation, item.source);
      }
      return sources;
    }, new Map<string, BibleSourceInfo>()).values()
  );

  return (
    <article className="card studyRecommendationsCard">
      <details
        open={isOpen}
        onToggle={(event) =>
          onToggleOpen?.((event.currentTarget as HTMLDetailsElement).open)
        }
      >
        <summary className="studyRecoSummaryRow">
          Recommended verses ({recommendations.length})
        </summary>
        <div className="list">
          {displayItems.map(
            ({
              item,
              index,
              passagePath,
              selectionTranslation,
              source,
              text,
              wasRequested
            }) => {
              return (
                <div
                  key={`${item.reference}-${index}`}
                  className="card studyRecoItem"
                >
                  <p className="studyRecoInline">
                    <strong className="studyRecoRef">
                      {onPreviewRecommendation ? (
                        <button
                          type="button"
                          className="recoLinkButton"
                          onClick={() =>
                            onPreviewRecommendation(
                              item.reference,
                              selectionTranslation
                            )
                          }
                        >
                          {item.reference}
                        </button>
                      ) : passagePath ? (
                        <a href={passagePath}>{item.reference}</a>
                      ) : (
                        item.reference
                      )}
                    </strong>
                    {text ? (
                      <span
                        className="muted studyRecoSummary scriptureText"
                        dir={source?.direction}
                        lang={source?.languageIso}
                      >
                        {text}
                      </span>
                    ) : isOpen ? (
                      <span className="muted studyRecoSummary" role="status">
                        {wasRequested
                          ? "Preview unavailable."
                          : "Loading preview…"}
                      </span>
                    ) : null}
                  </p>
                </div>
              );
            }
          )}
        </div>
        {displayedSources.map((source) => (
          <ScriptureAttribution key={source.translation} source={source} />
        ))}
      </details>
    </article>
  );
}
