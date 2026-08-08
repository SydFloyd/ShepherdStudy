import { z } from "zod";

const recommendationSchema = z
  .object({
    reference: z.string().trim().min(1).max(120),
    preview: z.string().trim().max(2_000).optional(),
    summary: z.string().trim().max(2_000).optional(),
    translation: z.string().trim().min(1).max(64).optional(),
    translationName: z.string().trim().min(1).max(500).optional(),
    source: z.lazy(() => bibleSourceSchema).optional()
  })
  .strict();

const passageFootnoteSchema = z
  .object({
    kind: z.enum(["footnote", "crossref"]),
    caller: z.string().max(40).nullable(),
    text: z.string().trim().min(1).max(4_000)
  })
  .strict();

const passageVerseSchema = z
  .object({
    verse: z.number().int().min(1).max(999),
    paragraph: z.number().int().min(0).max(10_000),
    text: z.string().trim().min(1).max(10_000),
    notes: z.array(passageFootnoteSchema).max(100)
  })
  .strict();

const bibleSourceSchema = z
  .object({
    translation: z.string().trim().min(1).max(64),
    provider: z.enum(["local", "dbs", "esv"]),
    providerId: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(500),
    vernacularTitle: z.string().trim().max(500).nullable(),
    languageName: z.string().trim().min(1).max(200),
    languageIso: z.string().trim().min(1).max(12),
    script: z.string().trim().min(1).max(12),
    direction: z.enum(["ltr", "rtl"]),
    year: z.number().int().min(0).max(3000).nullable(),
    copyright: z.string().max(2_000).nullable()
  })
  .strict();

const studyPassageSchema = z
  .object({
    origin: z.enum(["input", "anchor"]),
    reference: z.string().trim().min(1).max(120),
    chapterReference: z.string().trim().min(1).max(120),
    translation: z.string().trim().min(1).max(64),
    translationName: z.string().trim().min(1).max(500),
    source: bibleSourceSchema.optional(),
    verses: z.array(passageVerseSchema).max(200),
    chapterPath: z.string().max(500).nullable(),
    excerpted: z.boolean().optional()
  })
  .strict();

export const studyResponsePayloadSchema = z
  .object({
    mode: z.enum(["passage_only", "prompt_only", "passage_and_prompt"]),
    modeName: z.string().trim().min(1).max(80),
    assistantBehaviorName: z.string().trim().min(1).max(80),
    answer: z.string().trim().min(1).max(20_000),
    context: z.string().max(8_000),
    relevance: z.string().max(8_000),
    passages: z.array(studyPassageSchema).max(8).optional(),
    passage: studyPassageSchema.nullable(),
    recommendations: z.array(recommendationSchema).max(10),
    providerNotice: z.string().trim().min(1).max(500).optional(),
    saved: z.boolean(),
    thread: z
      .object({
        id: z.string().trim().min(1).max(64),
        title: z.string().max(120).nullable(),
        archivedAt: z.string().datetime().nullable(),
        updatedAt: z.string().datetime()
      })
      .strict()
      .optional()
  })
  .strict();
