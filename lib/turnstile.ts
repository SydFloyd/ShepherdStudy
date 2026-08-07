import { isIP } from "node:net";

import { TURNSTILE_ACTION } from "@/lib/turnstile-config";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 10_000;
const MAX_TOKEN_LENGTH = 2_048;

type TurnstileFailureReason =
  | "invalid_token"
  | "missing_configuration"
  | "siteverify_unavailable"
  | "challenge_rejected"
  | "action_mismatch"
  | "hostname_mismatch";

export type TurnstileVerification =
  | { success: true }
  | { success: false; reason: TurnstileFailureReason };

type SiteverifyResponse = {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
};

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

function getApplicationHostname() {
  const configuredOrigins = [
    process.env.ACCOUNT_EMAIL_BASE_URL,
    process.env.NEXTAUTH_URL
  ];

  for (const configuredOrigin of configuredOrigins) {
    if (!configuredOrigin?.trim()) {
      continue;
    }
    try {
      const url = new URL(configuredOrigin.trim());
      const hostname = normalizeHostname(url.hostname);
      const local = hostname === "localhost" || hostname === "127.0.0.1";
      if (
        !url.username &&
        !url.password &&
        (url.protocol === "https:" || (local && url.protocol === "http:"))
      ) {
        return hostname;
      }
    } catch {
      // Ignore malformed optional fallbacks; verification will fail closed.
    }
  }

  return "";
}

function getExpectedHostnames() {
  const configuredHostnames = new Set(
    (process.env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map(normalizeHostname)
      .filter(Boolean)
  );
  if (configuredHostnames.size > 0) {
    return configuredHostnames;
  }

  const applicationHostname = getApplicationHostname();
  return new Set(applicationHostname ? [applicationHostname] : []);
}

function getSecret() {
  return (
    process.env.TURNSTILE_SECRET?.trim() ||
    process.env.TURNSTILE_SECRET_KEY?.trim()
  );
}

function getRemoteIp(request: Request) {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]
  ];

  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && isIP(value) !== 0) {
      return value;
    }
  }

  return undefined;
}

export async function verifyTurnstile(
  request: Request,
  token: string
): Promise<TurnstileVerification> {
  const responseToken = token.trim();
  if (!responseToken || responseToken.length > MAX_TOKEN_LENGTH) {
    return { success: false, reason: "invalid_token" };
  }

  const secret = getSecret();
  const expectedHostnames = getExpectedHostnames();
  if (!secret || expectedHostnames.size === 0) {
    return { success: false, reason: "missing_configuration" };
  }

  const remoteIp = getRemoteIp(request);
  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: responseToken,
        ...(remoteIp ? { remoteip: remoteIp } : {})
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS)
    });
  } catch {
    return { success: false, reason: "siteverify_unavailable" };
  }

  if (!response.ok) {
    return { success: false, reason: "siteverify_unavailable" };
  }

  let parsedResult: unknown;
  try {
    parsedResult = await response.json();
  } catch {
    return { success: false, reason: "siteverify_unavailable" };
  }

  if (
    !parsedResult ||
    typeof parsedResult !== "object" ||
    Array.isArray(parsedResult)
  ) {
    return { success: false, reason: "siteverify_unavailable" };
  }
  const result = parsedResult as SiteverifyResponse;

  if (result.success !== true) {
    return { success: false, reason: "challenge_rejected" };
  }

  if (result.action !== TURNSTILE_ACTION) {
    return { success: false, reason: "action_mismatch" };
  }

  const hostname =
    typeof result.hostname === "string"
      ? normalizeHostname(result.hostname)
      : "";
  if (!hostname || !expectedHostnames.has(hostname)) {
    return { success: false, reason: "hostname_mismatch" };
  }

  return { success: true };
}

export function isTurnstileConfigured(): boolean {
  return Boolean(getSecret() && getExpectedHostnames().size > 0);
}
