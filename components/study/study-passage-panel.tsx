"use client";

import { useEffect, useState } from "react";

import { BibleTranslationId, isRtlTranslation } from "@/lib/bible";
import {
  buildPassagePreviewKey,
  fetchPassagePreviewCached
} from "@/lib/passage-preview-client";
import { StudyPassageResult } from "@/lib/study-contract";
import { getStudySelectionTranslation } from "@/lib/study-translation";

type Props = {
  passage: StudyPassageResult;
  selectedTranslation: BibleTranslationId;
};

export function StudyPassagePanel({ passage, selectedTranslation }: Props) {
  const targetTranslation = getStudySelectionTranslation(
    passage.reference,
    selectedTranslation
  );
  const displayKey = buildPassagePreviewKey(passage.reference, targetTranslation);
  const [previewByKey, setPreviewByKey] = useState<{
    key: string;
    passage: StudyPassageResult;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTranslatedPassage() {
      if (targetTranslation === passage.translation) {
        setPreviewByKey(null);
        return;
      }

      const preview = await fetchPassagePreviewCached({
        reference: passage.reference,
        translation: targetTranslation
      });

      if (cancelled) {
        return;
      }

      if (!preview) {
        setPreviewByKey(null);
        return;
      }

      setPreviewByKey({
        key: displayKey,
        passage: {
          origin: passage.origin,
          reference: preview.reference,
          chapterReference: preview.chapterReference,
          translation: preview.translation,
          translationName: preview.translationName,
          verses: preview.verses,
          chapterPath: preview.chapterPath,
          excerpted: preview.excerpted
        }
      });
    }

    void loadTranslatedPassage();

    return () => {
      cancelled = true;
    };
  }, [
    displayKey,
    passage.origin,
    passage.reference,
    passage.translation,
    targetTranslation
  ]);

  const displayPassage =
    previewByKey && previewByKey.key === displayKey ? previewByKey.passage : passage;
  const isRtl = isRtlTranslation(displayPassage.translation);
  const paragraphGroups = displayPassage.verses.reduce<
    Array<{
      paragraph: number;
      verses: typeof displayPassage.verses;
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
    <article className="card studyPassageCard">
      <div className="studyPassageHeader">
        <h2>{displayPassage.reference}</h2>
        {displayPassage.chapterPath ? (
          <a href={displayPassage.chapterPath}>Open chapter</a>
        ) : (
          <span className="muted">{displayPassage.chapterReference}</span>
        )}
      </div>
      <div
        className="paragraphList"
        dir={isRtl ? "rtl" : "ltr"}
        lang={isRtl ? "he" : undefined}
      >
        {paragraphGroups.map((group) => (
          <p className="paragraphText" key={group.paragraph}>
            {group.verses.map((verse) => (
              <span key={verse.verse} className="verseInline">
                <span className="verseNumber">{verse.verse}</span>
                <span>{verse.text}</span>
                {verse.notes.length > 0 ? (
                  <sup className="noteCounter">{verse.notes.length}</sup>
                ) : null}
              </span>
            ))}
          </p>
        ))}
      </div>
    </article>
  );
}
