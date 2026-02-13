import { StudyPassageResult } from "@/lib/study-contract";

type Props = {
  passage: StudyPassageResult;
};

export function StudyPassagePanel({ passage }: Props) {
  const paragraphGroups = passage.verses.reduce<
    Array<{
      paragraph: number;
      verses: typeof passage.verses;
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
    <article className="card">
      <h2>{passage.reference}</h2>
      <p className="muted">
        {passage.translationName} |{" "}
        {passage.chapterPath ? (
          <a href={passage.chapterPath}>Open chapter</a>
        ) : (
          passage.chapterReference
        )}
      </p>
      {passage.origin === "anchor" ? (
        <p className="muted">
          Anchor passage selected from recommendations.
          {passage.excerpted ? " Showing a short chapter excerpt." : ""}
        </p>
      ) : null}
      <div className="paragraphList">
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
