import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  DEFAULT_BIBLE_TRANSLATION,
  isMemorizationTranslation
} from "@/lib/bible";
import { getRequestMeta, logEvent } from "@/lib/logger";
import {
  BibleProviderError,
  bibleProviderErrorResponse
} from "@/lib/bible-provider-error";
import {
  getMemorizationSetFingerprint,
  hydrateMemorizationPassage,
  recommendationPayloadSchema,
  serializeMemorizationPassage
} from "@/lib/memorization-data";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

export async function GET(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/memorize",
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
        preferredTranslation: true,
        memorizationPassages: {
          orderBy: [
            { bookOrder: "asc" },
            { chapter: "asc" },
            { verseStart: "asc" },
            { createdAt: "asc" }
          ]
        },
        memorizationRecommendationCache: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const preferredTranslation = isMemorizationTranslation(
      user.preferredTranslation
    )
      ? user.preferredTranslation
      : DEFAULT_BIBLE_TRANSLATION;
    const fingerprint = getMemorizationSetFingerprint(
      user.memorizationPassages
    );

    let recommendations = null;
    const cache = user.memorizationRecommendationCache;
    if (
      cache?.sourceFingerprint === fingerprint &&
      cache.translation === preferredTranslation
    ) {
      const parsed = recommendationPayloadSchema.safeParse(cache.payload);
      if (parsed.success) {
        recommendations = parsed.data;
      }
    }

    const hydratedPassages = await Promise.all(
      user.memorizationPassages.map(hydrateMemorizationPassage)
    );
    const response = NextResponse.json({
      preferredTranslation,
      passages: hydratedPassages.map(serializeMemorizationPassage),
      recommendations,
      recommendationsStale: Boolean(cache && !recommendations)
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof BibleProviderError) {
      return bibleProviderErrorResponse(error);
    }
    captureServerException(error, { route: "/api/memorize", requestId });
    logEvent("error", "memorize.load_failed", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to load memorization progress right now." },
      { status: 500 }
    );
  }
}
