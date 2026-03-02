import { BibleTranslationId, isTranslationCompatibleWithBook } from "@/lib/bible";
import { parseScriptureReference } from "@/lib/scripture";

export function getStudySelectionTranslation(
  reference: string,
  translation: BibleTranslationId
): BibleTranslationId {
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
