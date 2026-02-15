import { isTranslationCompatibleWithBook } from "@/lib/bible";
import { buildPassagePath, parseScriptureReference } from "@/lib/scripture";
import { StudyRecommendation } from "@/lib/study-contract";

type Props = {
  recommendations: StudyRecommendation[];
  translation: string;
  sourceNodeId?: string | null;
  isOpen?: boolean;
  onToggleOpen?: (open: boolean) => void;
  onPreviewRecommendation?: (
    reference: string,
    selectionTranslation?: string,
    sourceNodeId?: string
  ) => void;
};

export function StudyRecommendations({
  recommendations,
  translation,
  sourceNodeId,
  isOpen = true,
  onToggleOpen,
  onPreviewRecommendation
}: Props) {
  function getSelectionTranslation(reference: string): string {
    const parsed = parseScriptureReference(reference);
    if (!parsed) {
      return translation;
    }

    if (isTranslationCompatibleWithBook(translation, parsed.book)) {
      return translation;
    }

    if (translation === "uhb") {
      return "ugnt";
    }
    if (translation === "ugnt") {
      return "uhb";
    }
    return translation;
  }

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
          {recommendations.map((item) => {
            const selectionTranslation = getSelectionTranslation(item.reference);
            const passagePath = buildPassagePath(
              item.reference,
              selectionTranslation
            );
            const summary = item.summary || item.reason || item.application || "";

            return (
              <div key={`${item.reference}-${summary}`} className="card studyRecoItem">
                <p className="studyRecoInline">
                  <strong className="studyRecoRef">
                    {onPreviewRecommendation ? (
                      <button
                        type="button"
                        className="recoLinkButton"
                        onClick={() =>
                          onPreviewRecommendation(
                            item.reference,
                            selectionTranslation,
                            sourceNodeId ?? undefined
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
                  {summary ? (
                    <span className="muted studyRecoSummary">{summary}</span>
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
