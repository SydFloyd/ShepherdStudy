import { createHash, createHmac } from "node:crypto";

export type RequestHeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>;

function getHeader(headers: RequestHeaderSource, name: string) {
  if (headers instanceof Headers) {
    return headers.get(name);
  }

  const direct = headers[name];
  if (direct !== undefined) {
    return Array.isArray(direct) ? direct[0] : direct;
  }

  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase()
  );
  const value = entry?.[1];
  return Array.isArray(value) ? value[0] : value;
}

export function pseudonymousDigest(value: string) {
  const secret =
    process.env.RATE_LIMIT_SECRET?.trim() ||
    process.env.QUOTA_ACTOR_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();
  const digest = secret
    ? createHmac("sha256", secret).update(value).digest("hex")
    : createHash("sha256").update(value).digest("hex");
  return digest.slice(0, 32);
}

export function getPseudonymousRequestActor(
  headers: RequestHeaderSource,
  options: { includeUserAgent?: boolean } = {}
) {
  const forwardedFor = getHeader(headers, "x-forwarded-for");
  const firstIp =
    getHeader(headers, "cf-connecting-ip")?.trim() ||
    getHeader(headers, "x-real-ip")?.trim() ||
    forwardedFor?.split(",")[0]?.trim() ||
    "unknown-ip";
  const material = options.includeUserAgent
    ? `${firstIp}|${getHeader(headers, "user-agent") ?? "unknown"}`
    : firstIp;
  return pseudonymousDigest(material);
}
