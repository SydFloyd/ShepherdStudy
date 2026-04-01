import { MarkdownMessage } from "@/components/shared/markdown-message";
import { BibleTranslationId } from "@/lib/bible";
import { buildPassagePath, extractScriptureReferencesFromText } from "@/lib/scripture";
import { getStudySelectionTranslation } from "@/lib/study-translation";

type Props = {
  answer: string;
  translation: BibleTranslationId;
  onPreviewReference?: (reference: string, selectionTranslation?: string) => void;
};

export function StudyAssistantPanel({
  answer,
  translation,
  onPreviewReference
}: Props) {
  const references = extractScriptureReferencesFromText(answer).references.slice(0, 12);

  return (
    <article className="card assistantPanel">
      <h2>Assistant</h2>
      <MarkdownMessage content={answer} />
      {references.length > 0 ? (
        <div className="assistantAnswerReferences">
          <p className="muted">References in this response</p>
          <div className="list">
            {references.map((reference) => {
              const selectionTranslation = getStudySelectionTranslation(
                reference,
                translation
              );
              const passagePath = buildPassagePath(
                reference,
                selectionTranslation
              );

              return onPreviewReference ? (
                <button
                  type="button"
                  key={reference}
                  className="recoLinkButton"
                  onClick={() =>
                    onPreviewReference(reference, selectionTranslation)
                  }
                >
                  {reference}
                </button>
              ) : passagePath ? (
                <a key={reference} href={passagePath}>
                  {reference}
                </a>
              ) : (
                <span key={reference}>{reference}</span>
              );
            })}
          </div>
        </div>
      ) : null}
    </article>
  );
}
