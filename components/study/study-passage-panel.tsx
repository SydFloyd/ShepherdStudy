"use client";

import { ScriptureAttribution } from "@/components/scripture-attribution";
import {
  getLocalBibleVersion,
  toBibleSourceInfo
} from "@/lib/bible";
import { StudyPassageResult } from "@/lib/study-contract";

type Props = {
  passage: StudyPassageResult;
};

export function StudyPassagePanel({ passage }: Props) {
  const displayPassage = passage;
  const source =
    displayPassage.source ??
    (() => {
      const localVersion = getLocalBibleVersion(displayPassage.translation);
      return localVersion ? toBibleSourceInfo(localVersion) : undefined;
    })();
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
        className="paragraphList scriptureText"
        dir={source?.direction ?? "ltr"}
        lang={source?.languageIso}
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
      <ScriptureAttribution source={source ?? null} />
    </article>
  );
}
