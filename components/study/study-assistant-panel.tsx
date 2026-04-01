import { memo, useMemo } from "react";

import { MarkdownMessage } from "@/components/shared/markdown-message";
import { BibleTranslationId } from "@/lib/bible";
import { buildPassagePath, extractScriptureReferencesFromText } from "@/lib/scripture";
import { getStudySelectionTranslation } from "@/lib/study-translation";

const MAX_ASSISTANT_REFERENCES = 12;

type Props = {
  answer: string;
  translation: BibleTranslationId;
  onPreviewReference?: (reference: string, selectionTranslation?: string) => void;
};

function StudyAssistantPanelComponent({
  answer,
  translation,
  onPreviewReference
}: Props) {
  const references = useMemo(() => {
    const extracted = extractScriptureReferencesFromText(answer).references;
    const seen = new Set<string>();
    const deduped: string[] = [];

    for (const reference of extracted) {
      const normalized = reference.trim().replace(/\s+/g, " ");
      const key = normalized.toLowerCase();
      if (!normalized || seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(normalized);
      if (deduped.length >= MAX_ASSISTANT_REFERENCES) {
        break;
      }
    }

    return deduped;
  }, [answer]);

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

export const StudyAssistantPanel = memo(StudyAssistantPanelComponent);
StudyAssistantPanel.displayName = "StudyAssistantPanel";
