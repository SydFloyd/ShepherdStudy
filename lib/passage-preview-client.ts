"use client";

import { PassagePreviewPayload } from "@/lib/study-client-contract";

const previewCache = new Map<string, PassagePreviewPayload | null>();
const inFlightPreviewRequests = new Map<
  string,
  Promise<PassagePreviewPayload | null>
>();

export function buildPassagePreviewKey(
  reference: string,
  translation: string
): string {
  const normalizedReference = reference.trim().replace(/\s+/g, " ").toLowerCase();
  return `${translation}:${normalizedReference}`;
}

async function requestPassagePreview(
  reference: string,
  translation: string
): Promise<PassagePreviewPayload | null> {
  try {
    const response = await fetch("/api/passage-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        translation
      })
    });

    const payload = (await response.json()) as
      | (PassagePreviewPayload & { error?: undefined })
      | { error: string };

    if (!response.ok || "error" in payload) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function fetchPassagePreviewCached(input: {
  reference: string;
  translation: string;
}): Promise<PassagePreviewPayload | null> {
  const cacheKey = buildPassagePreviewKey(input.reference, input.translation);
  const cached = previewCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const existingRequest = inFlightPreviewRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = requestPassagePreview(input.reference, input.translation)
    .then((payload) => {
      previewCache.set(cacheKey, payload);
      return payload;
    })
    .finally(() => {
      inFlightPreviewRequests.delete(cacheKey);
    });

  inFlightPreviewRequests.set(cacheKey, request);
  return request;
}
