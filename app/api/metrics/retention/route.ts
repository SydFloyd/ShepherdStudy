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
    route: "/api/metrics/retention",
    method: req.method
  });

  if (!isAuthorized(req)) {
    logEvent("warn", "retention.unauthorized", requestMeta);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    usersCreated7d,
    studyThreads,
    wwjdThreads,
    studyActive7d,
    wwjdActive7d,
    studyActive30d,
    wwjdActive30d
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.studyThread.count(),
    prisma.wwjdThread.count(),
    prisma.studyMessage.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.wwjdMessage.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.studyMessage.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.wwjdMessage.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      distinct: ["userId"],
      select: { userId: true }
    })
  ]);

  const activeUsers7d = new Set([
    ...studyActive7d.map((x) => x.userId),
    ...wwjdActive7d.map((x) => x.userId)
  ]).size;
  const activeUsers30d = new Set([
    ...studyActive30d.map((x) => x.userId),
    ...wwjdActive30d.map((x) => x.userId)
  ]).size;

  logEvent("info", "retention.ok", requestMeta);
  return NextResponse.json({
    generatedAt: now.toISOString(),
    users: {
      total: totalUsers,
      createdLast7d: usersCreated7d,
      activeLast7d: activeUsers7d,
      activeLast30d: activeUsers30d
    },
    engagement: {
      studyThreads,
      wwjdThreads
    }
  });
}
