import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { getBearerToken, safeEqualSecret } from "@/lib/secret-auth";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
} as const;

export async function GET(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/maintenance/cleanup",
    method: request.method
  });
  const expected = process.env.CRON_SECRET?.trim();
  const candidate = getBearerToken(request);
  if (
    !expected ||
    expected.length < 16 ||
    !candidate ||
    !safeEqualSecret(candidate, expected)
  ) {
    logEvent("warn", "maintenance.cleanup_unauthorized", requestMeta);
    return Response.json(
      { error: "Unauthorized." },
      { status: 401, headers: PRIVATE_HEADERS }
    );
  }

  try {
    const now = new Date();
    const [cache, rateLimits] = await prisma.$transaction([
      prisma.wordLensCache.deleteMany({ where: { expiresAt: { lt: now } } }),
      prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } })
    ]);
    logEvent("info", "maintenance.cleanup_ok", {
      ...requestMeta,
      expiredWordLensCacheRows: cache.count,
      expiredRateLimitBuckets: rateLimits.count
    });
    return Response.json(
      {
        ok: true,
        expiredWordLensCacheRows: cache.count,
        expiredRateLimitBuckets: rateLimits.count
      },
      { headers: PRIVATE_HEADERS }
    );
  } catch (error) {
    captureServerException(error, {
      route: "/api/maintenance/cleanup",
      requestId
    });
    logEvent("error", "maintenance.cleanup_failure", {
      ...requestMeta,
      error
    });
    return Response.json(
      { error: "Cleanup failed." },
      { status: 500, headers: PRIVATE_HEADERS }
    );
  }
}
