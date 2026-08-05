import OpenAI from "openai";
import { z } from "zod";

const interlinearMapRowSchema = z.object({
  position: z.coerce.number().int().nonnegative(),
  aiTranslation: z.string().trim().max(80).default("")
});

const transliterationRowSchema = z.object({
  position: z.coerce.number().int().nonnegative(),
  transliteration: z.string().trim().max(120).default("")
});

const noteRowSchema = z.object({
  position: z.coerce.number().int().nonnegative(),
  note: z.string().trim().max(220).default("")
});

const morphologyRowSchema = z.object({
  position: z.coerce.number().int().nonnegative(),
  partOfSpeech: z.string().trim().max(64).default(""),
  type: z.string().trim().max(64).default(""),
  gender: z.string().trim().max(32).default(""),
  number: z.string().trim().max(32).default(""),
  state: z.string().trim().max(32).default(""),
  long: z.string().trim().max(120).default("")
});

const rowEnvelopeSchema = z.object({
  rows: z.array(z.unknown()).default([])
});

export type WordLensToken = {
  position: number;
  text: string;
  lemma: string | null;
  strong: string | null;
  morph: string | null;
};

export type WordLensInterlinearMapRow = z.infer<typeof interlinearMapRowSchema>;
export type WordLensTransliterationRow = z.infer<typeof transliterationRowSchema>;
export type WordLensNoteRow = z.infer<typeof noteRowSchema>;
export type WordLensMorphologyRow = z.infer<typeof morphologyRowSchema>;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const organization = process.env.OPENAI_ORGANIZATION?.trim();
  const project = process.env.OPENAI_PROJECT?.trim();

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    organization: organization || undefined,
    project: project || undefined,
    maxRetries: 2,
    timeout: 20000
  });
}

async function callRows<S extends z.ZodTypeAny>(input: {
  systemPrompt: string;
  userPayload: object;
  rowSchema: S;
  model?: string;
}) {
  const client = getClient();
  const completion = await client.chat.completions.create({
    model: input.model ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: JSON.stringify(input.userPayload, null, 2) }
    ]
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return [] as Array<z.output<S>>;
  }

  const parsedJson = JSON.parse(content) as { rows?: unknown };
  const rawRows = rowEnvelopeSchema.parse(parsedJson).rows;

  return rawRows
    .map((row) => input.rowSchema.safeParse(row))
    .filter((result) => result.success)
    .map((result) => result.data as z.output<S>);
}

const interlinearMapSystemPrompt = `
You produce interlinear mapping from original-language tokens to a selected Bible edition, which may be in any language.

Return only valid JSON:
{
  "rows": [
    {
      "position": 1,
      "aiTranslation": "short lexical gloss aligned to the selected edition"
    }
  ]
}

Rules:
- Return one row for every input token.
- Use exact input position values (1-based).
- Keep aiTranslation short (usually 1-6 words).
- Prefer lexical sense over polished paraphrase.
- If uncertain, use blank string instead of guessing.
- Match the language and script of the selected target verse. If the target language cannot be identified reliably, use a concise English lexical gloss.
`.trim();

const transliterationSystemPrompt = `
You transliterate biblical Greek or Hebrew tokens into Latin script for pronunciation.

Return only valid JSON:
{
  "rows": [
    {
      "position": 1,
      "transliteration": "latin transliteration"
    }
  ]
}

Rules:
- Return one row for every input token.
- Use exact input position values (1-based).
- transliteration should be plain ASCII where possible.
- If uncertain, use blank string.
`.trim();

const notesSystemPrompt = `
You are writing "worth calling out" notes for everyday Bible readers.

Return only valid JSON:
{
  "rows": [
    {
      "position": 1,
      "note": "optional notable nuance"
    }
  ]
}

Rules:
- Return one row for every input token.
- Use exact input position values (1-based).
- Set most notes to blank.
- Add a note only when the token gives meaningful insight that is not obvious from the selected target verse.
- Good note types:
  - translation-impact nuance (alternate sense that changes how the line reads),
  - title/name nuance,
  - idiom or metaphor flattened by English,
  - established theological term-load that a plain gloss can miss.
- Never explain grammar classes or morphology (no noun/verb labels, no plural/singular comments, no tense/case/gender/number/state, no tag codes).
- Do not repeat information already shown in the table fields.
- No devotional advice or application.
- Keep each note plain-language, concrete, and <= 120 characters.
- If nothing stands out, return blank notes for all rows.
`.trim();

const morphologySystemPrompt = `
You convert Bible token morphology tags into compact grammatical fields.

Return only valid JSON:
{
  "rows": [
    {
      "position": 1,
      "partOfSpeech": "",
      "type": "",
      "gender": "",
      "number": "",
      "state": "",
      "long": ""
    }
  ]
}

Rules:
- Return one row for every input token.
- Use exact input position values (1-based).
- Fill fields only when inferable from the given token data.
- Use blank string for unknown fields.
- Keep "long" compact and factual.
`.trim();

export async function generateWordLensInterlinearMap(input: {
  reference: string;
  sourceTranslationName: string;
  sourceVerseText: string;
  targetTranslationName: string;
  targetVerseText: string;
  words: WordLensToken[];
  model?: string;
}) {
  const rows = await callRows({
    systemPrompt: interlinearMapSystemPrompt,
    rowSchema: interlinearMapRowSchema,
    model: input.model,
    userPayload: {
      reference: input.reference,
      sourceTranslationName: input.sourceTranslationName,
      sourceVerseText: input.sourceVerseText,
      targetTranslationName: input.targetTranslationName,
      targetVerseText: input.targetVerseText,
      words: input.words
    }
  });

  return rows;
}

export async function generateWordLensTransliterations(input: {
  reference: string;
  sourceTranslationName: string;
  words: WordLensToken[];
  model?: string;
}) {
  return callRows({
    systemPrompt: transliterationSystemPrompt,
    rowSchema: transliterationRowSchema,
    model: input.model,
    userPayload: {
      reference: input.reference,
      sourceTranslationName: input.sourceTranslationName,
      words: input.words
    }
  });
}

export async function generateWordLensNotes(input: {
  reference: string;
  sourceTranslationName: string;
  sourceVerseText: string;
  targetTranslationName: string;
  targetVerseText: string;
  words: WordLensToken[];
  model?: string;
}) {
  return callRows({
    systemPrompt: notesSystemPrompt,
    rowSchema: noteRowSchema,
    model: input.model,
    userPayload: {
      reference: input.reference,
      sourceTranslationName: input.sourceTranslationName,
      sourceVerseText: input.sourceVerseText,
      targetTranslationName: input.targetTranslationName,
      targetVerseText: input.targetVerseText,
      words: input.words
    }
  });
}

export async function generateWordLensMorphology(input: {
  reference: string;
  sourceTranslationName: string;
  words: WordLensToken[];
  model?: string;
}) {
  return callRows({
    systemPrompt: morphologySystemPrompt,
    rowSchema: morphologyRowSchema,
    model: input.model,
    userPayload: {
      reference: input.reference,
      sourceTranslationName: input.sourceTranslationName,
      words: input.words
    }
  });
}
