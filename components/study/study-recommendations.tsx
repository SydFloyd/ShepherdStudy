"use client";

import { useEffect, useState } from "react";

import { BibleTranslationId } from "@/lib/bible";
import {
  buildPassagePreviewKey,
  fetchPassagePreviewCached
} from "@/lib/passage-preview-client";
import { buildPassagePath } from "@/lib/scripture";
import { StudyRecommendation } from "@/lib/study-contract";
import { getStudySelectionTranslation } from "@/lib/study-translation";

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
  const [livePreviewByKey, setLivePreviewByKey] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    let cancelled = false;

    async function loadLivePreviews() {
      if (recommendations.length === 0) {
        setLivePreviewByKey({});
        return;
      }

      const entries = await Promise.all(
        recommendations.map(async (item, index) => {
          const selectionTranslation = getStudySelectionTranslation(
            item.reference,
            translation
          );
          const previewData = await fetchPassagePreviewCached({
            reference: item.reference,
            translation: selectionTranslation
          });
          const key = `${index}:${buildPassagePreviewKey(
            item.reference,
            selectionTranslation
          )}`;
          const text =
            previewData?.verses[0]?.text?.trim() ?? item.preview?.trim() ?? "";
          return { key, text };
        })
      );

      if (cancelled) {
        return;
      }

      const next: Record<string, string> = {};
      for (const entry of entries) {
        if (entry.text) {
          next[entry.key] = entry.text;
        }
      }
      setLivePreviewByKey(next);
    }

    void loadLivePreviews();

    return () => {
      cancelled = true;
    };
  }, [recommendations, translation]);

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
          {recommendations.map((item, index) => {
            const selectionTranslation = getStudySelectionTranslation(
              item.reference,
              translation
            );
            const previewKey = `${index}:${buildPassagePreviewKey(
              item.reference,
              selectionTranslation
            )}`;
            const passagePath = buildPassagePath(
              item.reference,
              selectionTranslation
            );
            const preview = livePreviewByKey[previewKey] ?? item.preview?.trim() ?? "";

            return (
              <div key={`${item.reference}-${index}`} className="card studyRecoItem">
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
                  {preview ? (
                    <span className="muted studyRecoSummary">{preview}</span>
                  ) : null}
                </p>
              </div>
            );
          })}
        </div>
      </details>
    </article>
  );
}
