import { getBearerToken, safeEqualSecret } from "@/lib/secret-auth";

export function isMetricsRequestAuthorized(request: Request) {
  const expected = process.env.ADMIN_METRICS_KEY?.trim();
  if (!expected || expected.length < 16) {
    return false;
  }

  const header = request.headers.get("x-admin-key")?.trim();
  const candidates = [header, getBearerToken(request)].filter(
    (value): value is string => Boolean(value)
  );

  return candidates.some((candidate) => safeEqualSecret(candidate, expected));
}

export const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
} as const;
