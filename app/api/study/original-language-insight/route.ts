import { NextResponse } from "next/server";
import { z } from "zod";

import { getTranslationLabel } from "@/lib/bible";
import { getOriginalLanguageSnapshot } from "@/lib/local-bible";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { generateOriginalLanguageInsight } from "@/lib/openai";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { PassageVerse } from "@/lib/study-contract";

const verseSchema = z.object({
  verse: z.number().int().positive(),
  paragraph: z.number().int().nonnegative(),
  text: z.string().min(1),
  notes: z
    .array(
      z.object({
        kind: z.string().min(1),
        caller: z.string().nullable().optional(),
        text: z.string().min(1)
      })
    )
    .default([])
});

const passageSchema = z.object({
  chapterReference: z.string().min(1),
  verses: z.array(verseSchema).min(1)
});

const inputSchema = z.object({
  selectedTranslation: z.string().min(1),
  passage: passageSchema
});

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/study/original-language-insight",
    method: req.method
  });

  try {
    const input = inputSchema.parse(await req.json());
    const normalizedVerses: PassageVerse[] = input.passage.verses.map((verse) => ({
      verse: verse.verse,
      paragraph: verse.paragraph,
      text: verse.text,
      notes: verse.notes
        .filter((note) => note.kind === "footnote" || note.kind === "crossref")
        .map((note) => ({
          kind: note.kind as "footnote" | "crossref",
          caller: note.caller ?? null,
          text: note.text
        }))
    }));

    const original = await getOriginalLanguageSnapshot({
      chapterReference: input.passage.chapterReference,
      verses: normalizedVerses
    });

    if (!original) {
      return NextResponse.json(
        { error: "Original-language source unavailable for this passage." },
        { status: 404 }
      );
    }

    const insight = await generateOriginalLanguageInsight({
      selectedTranslation: input.selectedTranslation,
      selectedTranslationName: getTranslationLabel(input.selectedTranslation),
      chapterReference: input.passage.chapterReference,
      selectedVerses: input.passage.verses.map((verse) => ({
        verse: verse.verse,
        text: verse.text
      })),
      sourceTranslation: original.sourceTranslation,
      sourceTranslationName: original.sourceTranslationName,
      sourceVerses: original.verses
    });

    return NextResponse.json({ insight });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logEvent("warn", "study.original_language_insight.invalid_input", {
        ...requestMeta,
        issues: error.issues
      });
      return NextResponse.json(
        {
          error: "Invalid original-language insight request.",
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        },
        { status: 400 }
      );
    }

    captureServerException(error, {
      route: "/api/study/original-language-insight",
      requestId
    });
    logEvent("error", "study.original_language_insight.failure", {
      ...requestMeta,
      error
    });
    return NextResponse.json(
      { error: "Unable to generate original-language insight right now." },
      { status: 500 }
    );
  }
}
