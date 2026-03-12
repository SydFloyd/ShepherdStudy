import { NextResponse } from "next/server";

import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";

function isAuthorized(req: Request) {
  const expected = process.env.ADMIN_METRICS_KEY;
  if (!expected) {
    return false;
  }

  const header = req.headers.get("x-admin-key");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === expected || bearer === expected;
}

export async function GET(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/metrics/usage",
    method: req.method
  });

  if (!isAuthorized(req)) {
    logEvent("warn", "usage_metrics.unauthorized", requestMeta);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalEvents,
    eventsLast24h,
    eventsLast7d,
    authenticatedLast7d,
    anonymousLast7d,
    byFeatureRows,
    byPageRows,
    byActionRows,
    bySourcePathRows,
    recent
  ] = await Promise.all([
    prisma.usageEvent.count(),
    prisma.usageEvent.count({
      where: { createdAt: { gte: twentyFourHoursAgo } }
    }),
    prisma.usageEvent.count({
      where: { createdAt: { gte: sevenDaysAgo } }
    }),
    prisma.usageEvent.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
        userId: { not: null }
      }
    }),
    prisma.usageEvent.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
        userId: null
      }
    }),
    prisma.usageEvent.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true }
    }),
    prisma.usageEvent.groupBy({
      by: ["pagePath"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true }
    }),
    prisma.usageEvent.groupBy({
      by: ["action"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true }
    }),
    prisma.usageEvent.groupBy({
      by: ["sourcePath"],
      where: {
        createdAt: { gte: sevenDaysAgo },
        sourcePath: { not: null }
      },
      _count: { _all: true }
    }),
    prisma.usageEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        feature: true,
        pagePath: true,
        apiRoute: true,
        action: true,
        sourcePath: true,
        sourceHost: true,
        userId: true,
        anonId: true
      }
    })
  ]);

  const byFeature = byFeatureRows
    .map((row) => ({
      feature: row.feature,
      count: row._count._all
    }))
    .sort((a, b) => b.count - a.count);

  const byPage = byPageRows
    .map((row) => ({
      pagePath: row.pagePath,
      count: row._count._all
    }))
    .sort((a, b) => b.count - a.count);

  const byAction = byActionRows
    .map((row) => ({
      action: row.action,
      count: row._count._all
    }))
    .sort((a, b) => b.count - a.count);

  const topSourcePaths = bySourcePathRows
    .map((row) => ({
      sourcePath: row.sourcePath,
      count: row._count._all
    }))
    .filter((row): row is { sourcePath: string; count: number } =>
      Boolean(row.sourcePath)
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const recentEvents = recent.map((item) => ({
    id: item.id,
    createdAt: item.createdAt.toISOString(),
    feature: item.feature,
    pagePath: item.pagePath,
    apiRoute: item.apiRoute,
    action: item.action,
    sourcePath: item.sourcePath,
    sourceHost: item.sourceHost,
    userId: item.userId,
    anonId: item.anonId
  }));

  logEvent("info", "usage_metrics.ok", {
    ...requestMeta,
    totalEvents,
    eventsLast7d
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    summary: {
      totalEvents,
      eventsLast24h,
      eventsLast7d,
      authenticatedLast7d,
      anonymousLast7d
    },
    byFeature,
    byPage,
    byAction,
    topSourcePaths,
    recentEvents
  });
}
