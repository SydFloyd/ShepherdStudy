import {
  ENGLISH_BIBLE_TRANSLATION_PRIORITY,
  type BibleVersion
} from "@/lib/bible";

export const TRANSLATION_SEARCH_LIMIT = 50;

export type BibleLanguageOption = {
  iso: string;
  name: string;
  count: number;
};

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

function getBrowsePriority(version: BibleVersion): number {
  if (version.languageIso.trim().toLowerCase() !== "eng") {
    return ENGLISH_BIBLE_TRANSLATION_PRIORITY.length;
  }
  const index = ENGLISH_BIBLE_TRANSLATION_PRIORITY.indexOf(
    version.value as (typeof ENGLISH_BIBLE_TRANSLATION_PRIORITY)[number]
  );
  return index === -1 ? ENGLISH_BIBLE_TRANSLATION_PRIORITY.length : index;
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

export function getBibleLanguageOptions(
  versions: readonly BibleVersion[]
): BibleLanguageOption[] {
  const byIso = new Map<string, BibleLanguageOption>();

  for (const version of versions) {
    const iso = version.languageIso.trim().toLowerCase();
    if (!iso) {
      continue;
    }

    const existing = byIso.get(iso);
    if (existing) {
      existing.count += 1;
      continue;
    }

    byIso.set(iso, {
      iso,
      name: version.languageName.trim() || iso.toUpperCase(),
      count: 1
    });
  }

  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return [...byIso.values()].sort(
    (left, right) =>
      collator.compare(left.name, right.name) ||
      collator.compare(left.iso, right.iso)
  );
}

export function filterBibleVersionsByLanguage(
  versions: readonly BibleVersion[],
  languageIso: string
): BibleVersion[] {
  const normalizedIso = languageIso.trim().toLowerCase();
  if (!normalizedIso) {
    return [...versions];
  }

  return versions.filter(
    (version) => version.languageIso.trim().toLowerCase() === normalizedIso
  );
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
      if (normalizedQuery && left.score !== right.score) {
        return left.score - right.score;
      }
      const priorityDifference =
        getBrowsePriority(left.version) - getBrowsePriority(right.version);
      if (priorityDifference !== 0) {
        return priorityDifference;
      }
      if (!normalizedQuery) {
        return left.index - right.index;
      }
      if (left.version.provider !== right.version.provider) {
        return left.version.provider === "local" ? -1 : 1;
      }
      return left.index - right.index;
    })
    .slice(0, Math.max(0, limit))
    .map(({ version }) => version);
}
