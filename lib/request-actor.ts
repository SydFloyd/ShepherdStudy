import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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

const CLOUDFLARE_PROXY_AUTH_HEADER =
  "x-shepherdstudy-cloudflare-proxy-secret";

function firstForwardedIp(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() || undefined;
}

function isTrustedCloudflareProxy(headers: RequestHeaderSource) {
  const configuredSecret = process.env.CLOUDFLARE_PROXY_SECRET?.trim();
  const presentedSecret = getHeader(
    headers,
    CLOUDFLARE_PROXY_AUTH_HEADER
  )?.trim();
  if (!configuredSecret || configuredSecret.length < 32 || !presentedSecret) {
    return false;
  }

  const expectedDigest = createHash("sha256")
    .update(configuredSecret)
    .digest();
  const presentedDigest = createHash("sha256")
    .update(presentedSecret)
    .digest();
  return timingSafeEqual(expectedDigest, presentedDigest);
}

export function getPseudonymousRequestActor(
  headers: RequestHeaderSource,
  options: { includeUserAgent?: boolean } = {}
) {
  // Vercel overwrites x-vercel-forwarded-for, so it is the default trusted
  // source there. A Cloudflare proxy may override that only by presenting a
  // server-configured shared secret; cf-connecting-ip alone is client-spoofable
  // when a deployment's direct Vercel URL remains reachable.
  const vercelIp = firstForwardedIp(
    getHeader(headers, "x-vercel-forwarded-for")
  );
  const cloudflareIp = isTrustedCloudflareProxy(headers)
    ? firstForwardedIp(getHeader(headers, "cf-connecting-ip"))
    : undefined;
  const firstIp =
    cloudflareIp ||
    vercelIp ||
    firstForwardedIp(getHeader(headers, "x-real-ip")) ||
    firstForwardedIp(getHeader(headers, "x-forwarded-for")) ||
    "unknown-ip";
  const material = options.includeUserAgent
    ? `${firstIp}|${getHeader(headers, "user-agent") ?? "unknown"}`
    : firstIp;
  return pseudonymousDigest(material);
}
