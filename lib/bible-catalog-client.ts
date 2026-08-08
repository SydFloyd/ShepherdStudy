"use client";

import { BibleVersion } from "@/lib/bible";

export type CatalogResponse = {
  translations: BibleVersion[];
  remoteAvailable: boolean;
  warning?: string;
};

let catalogPromise: Promise<CatalogResponse> | null = null;

function isBibleVersion(value: unknown): value is BibleVersion {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<BibleVersion>;
  return (
    typeof candidate.value === "string" &&
    typeof candidate.providerId === "string" &&
    (candidate.provider === "local" ||
      candidate.provider === "dbs" ||
      candidate.provider === "esv") &&
    typeof candidate.label === "string" &&
    typeof candidate.title === "string" &&
    (candidate.vernacularTitle === null ||
      typeof candidate.vernacularTitle === "string") &&
    typeof candidate.languageName === "string" &&
    typeof candidate.languageIso === "string" &&
    typeof candidate.script === "string" &&
    (candidate.direction === "ltr" || candidate.direction === "rtl") &&
    (candidate.year === null || typeof candidate.year === "number") &&
    (candidate.copyright === null || typeof candidate.copyright === "string") &&
    typeof candidate.originalLanguage === "boolean"
  );
}

export async function loadBibleCatalog(): Promise<CatalogResponse> {
  if (!catalogPromise) {
    catalogPromise = fetch("/api/bible/translations", {
      headers: { Accept: "application/json" }
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Bible translation catalog request failed.");
        }
        const payload = (await response.json()) as Partial<CatalogResponse>;
        const translations = Array.isArray(payload.translations)
          ? payload.translations.filter(isBibleVersion)
          : [];
        if (translations.length === 0) {
          throw new Error("Bible translation catalog was empty.");
        }
        return {
          translations,
          remoteAvailable: payload.remoteAvailable === true,
          warning:
            typeof payload.warning === "string" ? payload.warning : undefined
        };
      })
      .catch((error) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}
