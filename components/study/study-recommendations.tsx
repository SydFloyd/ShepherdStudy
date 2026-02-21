import { isTranslationCompatibleWithBook } from "@/lib/bible";
import { buildPassagePath, parseScriptureReference } from "@/lib/scripture";
import { StudyRecommendation } from "@/lib/study-contract";

type Props = {
  recommendations: StudyRecommendation[];
  translation: string;
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
          {recommendations.map((item, index) => {
            const selectionTranslation = getSelectionTranslation(item.reference);
            const passagePath = buildPassagePath(
              item.reference,
              selectionTranslation
            );
            const preview = item.preview?.trim() ?? "";

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
