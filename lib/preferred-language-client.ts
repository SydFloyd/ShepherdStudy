"use client";

import { DEFAULT_BIBLE_LANGUAGE } from "@/lib/bible";

let preferredLanguagePromise: Promise<string> | null = null;

export function loadPreferredLanguage(): Promise<string> {
  if (!preferredLanguagePromise) {
    preferredLanguagePromise = fetch("/api/account", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          return DEFAULT_BIBLE_LANGUAGE;
        }
        const payload = (await response.json()) as {
          account?: { preferredLanguage?: unknown };
        };
        const preferredLanguage = payload.account?.preferredLanguage;
        return typeof preferredLanguage === "string" && preferredLanguage.trim()
          ? preferredLanguage.trim().toLowerCase()
          : DEFAULT_BIBLE_LANGUAGE;
      })
      .catch(() => DEFAULT_BIBLE_LANGUAGE);
  }
  return preferredLanguagePromise;
}

export function setCachedPreferredLanguage(languageIso: string): void {
  preferredLanguagePromise = Promise.resolve(
    languageIso.trim().toLowerCase() || DEFAULT_BIBLE_LANGUAGE
  );
}
