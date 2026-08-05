import type { BibleVersion } from "@/lib/bible";
import {
  mergeBibleVersions,
  searchBibleVersions,
  TRANSLATION_SEARCH_LIMIT
} from "@/lib/bible-version-search";

function version(
  value: string,
  input: Partial<BibleVersion> = {}
): BibleVersion {
  return {
    value,
    provider: "dbs",
    providerId: value.replace("dbs:", ""),
    label: value,
    title: value,
    vernacularTitle: null,
    languageName: "English",
    languageIso: "eng",
    script: "Latn",
    direction: "ltr",
    year: null,
    copyright: null,
    originalLanguage: false,
    ...input
  };
}

describe("Bible version search", () => {
  it("searches titles, vernacular titles, language names, ISO codes, and IDs", () => {
    const catalog = [
      version("dbs:SPA001", {
        label: "Reina-Valera",
        title: "Reina-Valera 1909",
        vernacularTitle: "Santa Biblia",
        languageName: "Espa\u00f1ol",
        languageIso: "spa"
      }),
      version("dbs:FRA001", {
        label: "Louis Segond",
        languageName: "Fran\u00e7ais",
        languageIso: "fra"
      })
    ];

    expect(searchBibleVersions(catalog, "espanol")[0]?.value).toBe(
      "dbs:SPA001"
    );
    expect(searchBibleVersions(catalog, "santa biblia")[0]?.value).toBe(
      "dbs:SPA001"
    );
    expect(searchBibleVersions(catalog, "fra001")[0]?.value).toBe(
      "dbs:FRA001"
    );
  });

  it("pins local editions and limits broad result sets", () => {
    const remote = Array.from({ length: 70 }, (_, index) =>
      version(`dbs:ENG${index}`)
    );
    const local = version("web", {
      provider: "local",
      providerId: "web",
      label: "WEB"
    });

    const results = searchBibleVersions([...remote, local], "English");
    expect(results).toHaveLength(TRANSLATION_SEARCH_LIMIT);
    expect(results[0]?.value).toBe("web");
  });

  it("keeps the first catalog entry when merging duplicate IDs", () => {
    const local = version("web", {
      provider: "local",
      providerId: "web",
      label: "Local WEB"
    });
    const duplicate = version("web", { label: "Remote duplicate" });

    expect(mergeBibleVersions([local], [duplicate])).toEqual([local]);
  });
});
