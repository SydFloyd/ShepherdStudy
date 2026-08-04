import { createHash, timingSafeEqual } from "node:crypto";

function safeEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function isMetricsRequestAuthorized(request: Request) {
  const expected = process.env.ADMIN_METRICS_KEY?.trim();
  if (!expected || expected.length < 16) {
    return false;
  }

  const header = request.headers.get("x-admin-key")?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);
  const candidates = [header, bearerMatch?.[1]?.trim()].filter(
    (value): value is string => Boolean(value)
  );

  return candidates.some((candidate) => safeEqual(candidate, expected));
}

export const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
} as const;
