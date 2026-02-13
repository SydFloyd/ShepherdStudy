import { buildPassagePath } from "@/lib/scripture";
import { StudyRecommendation } from "@/lib/study-contract";

type Props = {
  recommendations: StudyRecommendation[];
  translation: string;
  sourceNodeId?: string | null;
  onSelectRecommendation?: (reference: string, sourceNodeId?: string) => void;
};

export function StudyRecommendations({
  recommendations,
  translation,
  sourceNodeId,
  onSelectRecommendation
}: Props) {
  return (
    <article className="card">
      <h3>Recommended references</h3>
      <div className="list">
        {recommendations.map((item) => {
          const passagePath = buildPassagePath(item.reference, translation);

          return (
            <div key={`${item.reference}-${item.reason}`} className="card">
              <p>
                <strong>
                  {onSelectRecommendation ? (
                    <button
                      type="button"
                      className="recoLinkButton"
                      onClick={() =>
                        onSelectRecommendation(item.reference, sourceNodeId ?? undefined)
                      }
                    >
                      {item.reference}
                    </button>
                  ) : passagePath ? (
                    <a href={passagePath}>{item.reference}</a>
                  ) : (
                    item.reference
                  )}
                </strong>{" "}
                <span className="pill">
                  confidence {Math.round(item.confidence * 100)}%
                </span>
              </p>
              <p>{item.reason}</p>
              <p className="muted">{item.application}</p>
            </div>
          );
        })}
      </div>
    </article>
  );
}
