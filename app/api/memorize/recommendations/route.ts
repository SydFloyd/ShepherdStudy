import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { consumeMemorizationRecommendationRateLimit } from "@/lib/auth-rate-limit";
import {
  isMemorizationTranslation,
  MemorizationTranslationId
} from "@/lib/bible";
import { getRequestMeta, logEvent } from "@/lib/logger";
import {
  getMemorizationSetFingerprint,
  MemorizationRecommendation,
  recommendationPayloadSchema,
  resolveMemorizationPassage
} from "@/lib/memorization-data";
import { generateMemorizationRecommendations } from "@/lib/memorization-recommendations";
import { mapOpenAiErrorToResponse } from "@/lib/openai-errors";
import { prisma } from "@/lib/prisma";
import type { QuotaTier } from "@/lib/quota";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const CURATED_STARTERS: MemorizationRecommendation[] = [
  {
    reference: "John 3:16",
    reason: "A concise foundation for remembering the good news of God’s love in Christ."
  },
  {
    reference: "Proverbs 3:5-6",
    reason: "A practical call to trust God and submit every path to him."
  },
  {
    reference: "Philippians 4:6-7",
    reason: "A compact passage joining prayer, thanksgiving, and God’s peace."
  },
  {
    reference: "Psalm 23:1-3",
    reason: "A memorable confession of the Lord’s care, provision, and guidance."
  },
  {
    reference: "Micah 6:8",
    reason: "A clear summary of justice, mercy, and humble walking with God."
  },
  {
    reference: "Romans 8:1-2",
    reason: "A strong reminder of freedom from condemnation in Christ."
  }
];

type SavedCoordinates = {
  bookOrder: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
};

function overlapsSaved(
  candidate: SavedCoordinates,
  saved: SavedCoordinates[]
) {
  return saved.some(
    (passage) =>
      passage.bookOrder === candidate.bookOrder &&
      passage.chapter === candidate.chapter &&
      passage.verseStart <= candidate.verseEnd &&
      candidate.verseStart <= passage.verseEnd
  );
}

async function validateRecommendations(input: {
  candidates: MemorizationRecommendation[];
  translation: MemorizationTranslationId;
  saved: SavedCoordinates[];
}) {
  const output: MemorizationRecommendation[] = [];
  const seen = new Set<string>();

  for (const candidate of input.candidates) {
    const resolution = await resolveMemorizationPassage({
      reference: candidate.reference,
      translation: input.translation
    });
    if (!resolution.ok || overlapsSaved(resolution.passage, input.saved)) {
      continue;
    }

    const key = `${resolution.passage.bookOrder}:${resolution.passage.chapter}:${resolution.passage.verseStart}:${resolution.passage.verseEnd}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push({
      reference: resolution.passage.reference,
      reason: candidate.reason
    });
    if (output.length >= 5) {
      break;
    }
  }

  return output;
}

export async function POST(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/memorize/recommendations",
    method: request.method
  });

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        accountTier: true,
        preferredTranslation: true,
        memorizationPassages: {
          orderBy: [
            { bookOrder: "asc" },
            { chapter: "asc" },
            { verseStart: "asc" }
          ]
        },
        memorizationRecommendationCache: true
      }
    });
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const translation: MemorizationTranslationId = isMemorizationTranslation(
      user.preferredTranslation
    )
      ? user.preferredTranslation
      : "web";
    const fingerprint = getMemorizationSetFingerprint(
      user.memorizationPassages
    );
    const existingCache = user.memorizationRecommendationCache;
    if (
      existingCache?.sourceFingerprint === fingerprint &&
      existingCache.translation === translation
    ) {
      const parsed = recommendationPayloadSchema.safeParse(
        existingCache.payload
      );
      if (parsed.success) {
        return NextResponse.json({
          recommendations: parsed.data,
          cached: true
        });
      }
    }

    const rateLimit = await consumeMemorizationRecommendationRateLimit({
      request,
      userId: session.user.id
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "Too many recommendation requests. Please try again later."
        },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const savedCoordinates = user.memorizationPassages.map((passage) => ({
      bookOrder: passage.bookOrder,
      chapter: passage.chapter,
      verseStart: passage.verseStart,
      verseEnd: passage.verseEnd
    }));

    let model = "curated-v1";
    let candidates = CURATED_STARTERS;
    if (user.memorizationPassages.length > 0) {
      const tier: QuotaTier =
        user.accountTier === "PAID" ? "PAID" : "FREE";
      const generated = await generateMemorizationRecommendations({
        savedReferences: user.memorizationPassages.map(
          (passage) => passage.reference
        ),
        translation,
        tier
      });
      model = generated.model;
      candidates = [...generated.recommendations, ...CURATED_STARTERS];
    }

    const recommendations = await validateRecommendations({
      candidates,
      translation,
      saved: savedCoordinates
    });
    if (recommendations.length === 0) {
      return NextResponse.json(
        { error: "No additional passages could be recommended right now." },
        { status: 422 }
      );
    }

    await prisma.memorizationRecommendationCache.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        sourceFingerprint: fingerprint,
        translation,
        model,
        payload: recommendations as Prisma.InputJsonValue
      },
      update: {
        sourceFingerprint: fingerprint,
        translation,
        model,
        payload: recommendations as Prisma.InputJsonValue
      }
    });

    logEvent("info", "memorize.recommendations_created", {
      ...requestMeta,
      model,
      recommendationCount: recommendations.length
    });
    return NextResponse.json({ recommendations, cached: false });
  } catch (error) {
    const openAiError = mapOpenAiErrorToResponse(error);
    if (openAiError) {
      logEvent("warn", "memorize.recommendations_upstream_error", {
        ...requestMeta,
        upstreamStatus: openAiError.status,
        upstreamCode: openAiError.code
      });
      return NextResponse.json(
        { error: openAiError.message },
        { status: openAiError.status }
      );
    }

    captureServerException(error, {
      route: "/api/memorize/recommendations",
      requestId
    });
    logEvent("error", "memorize.recommendations_failed", {
      ...requestMeta,
      error
    });
    return NextResponse.json(
      { error: "Unable to recommend passages right now." },
      { status: 500 }
    );
  }
}
