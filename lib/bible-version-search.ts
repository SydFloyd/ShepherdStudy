import type { BibleVersion } from "@/lib/bible";

export const TRANSLATION_SEARCH_LIMIT = 50;

function normalizeSearchText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function getSearchText(version: BibleVersion): string {
  return normalizeSearchText(
    [
      version.label,
      version.title,
      version.vernacularTitle,
      version.languageName,
      version.languageIso,
      version.script,
      version.providerId
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function getMatchScore(version: BibleVersion, normalizedQuery: string): number {
  if (!normalizedQuery) {
    return 0;
  }

  const fields = [
    version.label,
    version.title,
    version.vernacularTitle,
    version.languageName,
    version.languageIso,
    version.providerId
  ].map((field) => normalizeSearchText(field));

  if (fields.some((field) => field === normalizedQuery)) {
    return 0;
  }
  if (fields.some((field) => field.startsWith(normalizedQuery))) {
    return 1;
  }
  return 2;
}

export function mergeBibleVersions(
  ...catalogs: ReadonlyArray<readonly BibleVersion[]>
): BibleVersion[] {
  const byValue = new Map<string, BibleVersion>();
  for (const catalog of catalogs) {
    for (const version of catalog) {
      if (!byValue.has(version.value)) {
        byValue.set(version.value, version);
      }
    }
  }
  return [...byValue.values()];
}

export function searchBibleVersions(
  versions: readonly BibleVersion[],
  query: string,
  limit = TRANSLATION_SEARCH_LIMIT
): BibleVersion[] {
  const normalizedQuery = normalizeSearchText(query);
  const terms = normalizedQuery.split(" ").filter(Boolean);

  return versions
    .map((version, index) => ({
      version,
      index,
      searchText: getSearchText(version),
      score: getMatchScore(version, normalizedQuery)
    }))
    .filter(({ searchText }) => terms.every((term) => searchText.includes(term)))
    .sort((left, right) => {
      if (left.version.provider !== right.version.provider) {
        return left.version.provider === "local" ? -1 : 1;
      }
      if (left.score !== right.score) {
        return left.score - right.score;
      }
      return left.index - right.index;
    })
    .slice(0, Math.max(0, limit))
    .map(({ version }) => version);
}
