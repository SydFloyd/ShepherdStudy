import type { BibleVersion } from "@/lib/bible";
import {
  filterBibleVersionsByLanguage,
  getBibleLanguageOptions,
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

  it("starts English browsing with NASB, ESV, KJV, and WEB", () => {
    const catalog = [
      version("dbs:OTHER", { label: "Another English Bible" }),
      version("web", { provider: "local", providerId: "web", label: "WEB" }),
      version("esv", { provider: "esv", providerId: "esv", label: "ESV" }),
      version("kjv", { provider: "local", providerId: "kjv", label: "KJV" }),
      version("dbs:ENGNASB", { label: "New American Standard Bible" })
    ];

    expect(searchBibleVersions(catalog, "").map((item) => item.value)).toEqual([
      "dbs:ENGNASB",
      "esv",
      "kjv",
      "web",
      "dbs:OTHER"
    ]);
  });

  it("keeps exact text matches ahead of browse priorities while searching", () => {
    const catalog = [
      version("dbs:OTHER", { label: "Another English Bible" }),
      version("dbs:ENGNASB", { label: "New American Standard Bible" })
    ];

    expect(
      searchBibleVersions(catalog, "Another English Bible").map(
        (item) => item.value
      )
    ).toEqual(["dbs:OTHER"]);
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

  it("builds an alphabetized language filter with edition counts", () => {
    const catalog = [
      version("dbs:SPA001", {
        languageName: "Español",
        languageIso: "spa"
      }),
      version("dbs:ENG001"),
      version("dbs:SPA002", {
        languageName: "Español",
        languageIso: "SPA"
      })
    ];

    expect(getBibleLanguageOptions(catalog)).toEqual([
      { iso: "eng", name: "English", count: 1 },
      { iso: "spa", name: "Español", count: 2 }
    ]);
  });

  it("filters editions by language ISO without case sensitivity", () => {
    const english = version("dbs:ENG001");
    const spanish = version("dbs:SPA001", {
      languageName: "Español",
      languageIso: "spa"
    });

    expect(filterBibleVersionsByLanguage([english, spanish], "SPA")).toEqual([
      spanish
    ]);
    expect(filterBibleVersionsByLanguage([english, spanish], "")).toEqual([
      english,
      spanish
    ]);
  });
});
