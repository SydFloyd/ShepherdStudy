import type { BibleVersion } from "@/lib/bible";

const dbsMocks = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  getVersion: vi.fn()
}));

vi.mock("@/lib/dbs-bible", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dbs-bible")>(
    "@/lib/dbs-bible"
  );
  return {
    ...actual,
    getDbsBibleCatalog: dbsMocks.getCatalog,
    getDbsBibleVersion: dbsMocks.getVersion
  };
});

import { getBibleCatalog, getBibleVersion } from "@/lib/bible-catalog";
import { DbsBibleError } from "@/lib/dbs-bible";

const arabicVersion: BibleVersion = {
  value: "dbs:ARBVDV",
  provider: "dbs",
  providerId: "ARBVDV",
  label: "Arabic Van Dyck Bible",
  title: "Arabic Van Dyck Bible",
  vernacularTitle: null,
  languageName: "Arabic",
  languageIso: "arb",
  script: "Arab",
  direction: "rtl",
  year: 1865,
  copyright: "Copyright owner",
  originalLanguage: false
};

describe("Bible catalog", () => {
  it("combines local and available DBS translations", async () => {
    dbsMocks.getCatalog.mockResolvedValue([arabicVersion]);

    const catalog = await getBibleCatalog();

    expect(catalog.remoteAvailable).toBe(true);
    expect(catalog.translations.map((item) => item.value)).toEqual([
      "web",
      "kjv",
      "asv",
      "uhb",
      "ugnt",
      "dbs:ARBVDV"
    ]);
  });

  it("keeps local Bibles usable when DBS is temporarily unavailable", async () => {
    dbsMocks.getCatalog.mockRejectedValue(
      new DbsBibleError("temporarily unavailable", "unavailable", 503)
    );

    const catalog = await getBibleCatalog();

    expect(catalog.remoteAvailable).toBe(false);
    expect(catalog.translations.map((item) => item.value)).toEqual([
      "web",
      "kjv",
      "asv",
      "uhb",
      "ugnt"
    ]);
  });

  it("resolves local metadata without a remote call", async () => {
    const version = await getBibleVersion("web");

    expect(version).toMatchObject({ value: "web", provider: "local" });
    expect(dbsMocks.getVersion).not.toHaveBeenCalled();
  });

  it("offers ESV only when its server-side API key is configured", async () => {
    vi.stubEnv("ESV_API_KEY", "test-esv-key");
    dbsMocks.getCatalog.mockResolvedValue([]);

    const catalog = await getBibleCatalog();
    expect(catalog.translations).toContainEqual(
      expect.objectContaining({
        value: "esv",
        provider: "esv",
        year: 2025
      })
    );
    await expect(getBibleVersion("esv")).resolves.toEqual(
      expect.objectContaining({ value: "esv", provider: "esv" })
    );
    vi.unstubAllEnvs();
  });

  it("delegates DBS IDs and rejects unsupported identifier formats", async () => {
    dbsMocks.getVersion.mockResolvedValue(arabicVersion);

    await expect(getBibleVersion("dbs:ARBVDV")).resolves.toBe(arabicVersion);
    await expect(getBibleVersion("not-a-provider")).resolves.toBeNull();
    expect(dbsMocks.getVersion).toHaveBeenCalledOnce();
  });
});
