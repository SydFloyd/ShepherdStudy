import { createHash } from "node:crypto";

import { UsageFeature } from "@prisma/client";

import { logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const SOURCE_ROUTE_HEADER = "x-source-route";
const MAX_SOURCE_LENGTH = 256;

function truncateSource(value: string) {
  if (value.length <= MAX_SOURCE_LENGTH) {
    return value;
  }
  return value.slice(0, MAX_SOURCE_LENGTH);
}

function normalizePath(value: string | null) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  return truncateSource(trimmed);
}

function getSourceMeta(request: Request) {
  const explicitSource = normalizePath(request.headers.get(SOURCE_ROUTE_HEADER));
  if (explicitSource) {
    return {
      sourcePath: explicitSource,
      sourceHost: null as string | null
    };
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return {
      sourcePath: null as string | null,
      sourceHost: null as string | null
    };
  }

  try {
    const parsed = new URL(referer);
    const path = normalizePath(parsed.pathname) ?? null;
    return {
      sourcePath: path,
      sourceHost: parsed.host || null
    };
  } catch {
    return {
      sourcePath: null as string | null,
      sourceHost: null as string | null
    };
  }
}

function getAnonId(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstIp = forwardedFor?.split(",")[0]?.trim() ?? "";
  const userAgent = request.headers.get("user-agent")?.trim() ?? "";
  if (!firstIp && !userAgent) {
    return null;
  }

  const digest = createHash("sha256")
    .update(`${firstIp}|${userAgent}`)
    .digest("hex");

  return digest.slice(0, 32);
}

export async function trackUsageSuccess(input: {
  request: Request;
  feature: UsageFeature;
  pagePath: string;
  apiRoute: string;
  action: string;
  userId?: string | null;
  requestId?: string;
}) {
  const source = getSourceMeta(input.request);
  const anonId = input.userId ? null : getAnonId(input.request);

  try {
    await prisma.usageEvent.create({
      data: {
        feature: input.feature,
        pagePath: input.pagePath,
        apiRoute: input.apiRoute,
        action: input.action,
        sourcePath: source.sourcePath,
        sourceHost: source.sourceHost,
        userId: input.userId ?? null,
        anonId
      }
    });
  } catch (error) {
    logEvent("warn", "usage_event.write_failed", {
      requestId: input.requestId,
      feature: input.feature,
      pagePath: input.pagePath,
      apiRoute: input.apiRoute,
      error
    });
  }
}
