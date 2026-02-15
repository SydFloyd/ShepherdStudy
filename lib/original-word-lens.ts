import OpenAI from "openai";
import { z } from "zod";

const rowSchema = z.object({
  position: z.number().int().positive(),
  aiTranslation: z.string().trim().max(80).default(""),
  transliteration: z.string().trim().max(120).default(""),
  note: z.string().trim().max(220).default(""),
  partOfSpeech: z.string().trim().max(64).default(""),
  type: z.string().trim().max(64).default(""),
  gender: z.string().trim().max(32).default(""),
  number: z.string().trim().max(32).default(""),
  state: z.string().trim().max(32).default(""),
  long: z.string().trim().max(120).default("")
});

const responseSchema = z.object({
  rows: z.array(rowSchema).default([])
});

export type OriginalWordLensAiRow = z.infer<typeof rowSchema>;

function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 2,
    timeout: 20000
  });
}

const systemPrompt = `
You are a biblical languages assistant.
Given one verse in original language and one English verse translation, produce row-level lexical help.

Return only valid JSON with shape:
{
  "rows": [
    {
      "position": 1,
      "aiTranslation": "short gloss for this token",
      "transliteration": "latin transliteration for pronunciation",
      "note": "optional notable nuance; blank if nothing notable",
      "partOfSpeech": "noun/verb/etc if inferable",
      "type": "type/classification if inferable",
      "gender": "gender if inferable",
      "number": "singular/plural/etc if inferable",
      "state": "state/aspect if inferable",
      "long": "compact expanded parse from morph tag"
    }
  ]
}

Rules:
- Use blank string for unknown/unclear fields.
- Keep aiTranslation short (usually 1-4 English words).
- Keep note blank unless there is a meaningful nuance not obvious from English translation.
- Never invent theology; this is lexical support only.
`.trim();

export async function generateOriginalWordLensRows(input: {
  reference: string;
  sourceTranslationName: string;
  sourceVerseText: string;
  words: Array<{
    position: number;
    text: string;
    lemma: string | null;
    strong: string | null;
    morph: string | null;
  }>;
}) {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify(
          {
            reference: input.reference,
            sourceTranslationName: input.sourceTranslationName,
            sourceVerseText: input.sourceVerseText,
            words: input.words.map((word) => ({
              position: word.position,
              text: word.text,
              lemma: word.lemma,
              strong: word.strong,
              morph: word.morph
            }))
          },
          null,
          2
        )
      }
    ]
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    return [] as OriginalWordLensAiRow[];
  }

  const parsed = responseSchema.safeParse(JSON.parse(content));
  if (!parsed.success) {
    return [] as OriginalWordLensAiRow[];
  }

  return parsed.data.rows;
}
