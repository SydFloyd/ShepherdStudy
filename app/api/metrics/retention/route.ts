import { NextResponse } from "next/server";

import {
  isMetricsRequestAuthorized,
  PRIVATE_RESPONSE_HEADERS
} from "@/lib/admin-metrics-auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";

export async function GET(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/metrics/retention",
    method: req.method
  });

  if (!isMetricsRequestAuthorized(req)) {
    logEvent("warn", "retention.unauthorized", requestMeta);
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: PRIVATE_RESPONSE_HEADERS }
    );
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    usersCreated7d,
    studyThreads,
    studyActive7d,
    studyActive30d,
    recentRegistrations,
    recentStudyMessages
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.studyThread.count(),
    prisma.studyMessage.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.studyMessage.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true
      }
    }),
    prisma.studyMessage.groupBy({
      by: ["userId"],
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: 120,
    })
  ]);

  const activeUsers7d = studyActive7d.length;
  const activeUsers30d = studyActive30d.length;

  const latestStudyByUser = new Map<string, Date>();
  for (const row of recentStudyMessages) {
    if (row._max.createdAt) {
      latestStudyByUser.set(row.userId, row._max.createdAt);
    }
  }

  const activityUserIds = new Set<string>(latestStudyByUser.keys());
  const missingUserIds = Array.from(activityUserIds).filter(
    (id) => !recentRegistrations.some((user) => user.id === id)
  );
  const missingUsers =
    missingUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: missingUserIds } },
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true
          }
        })
      : [];

  const usersById = new Map(
    [...recentRegistrations, ...missingUsers].map((user) => [user.id, user])
  );

  const recentUsers = Array.from(usersById.values())
    .map((user) => {
      const studyAt = latestStudyByUser.get(user.id);
      const lastActivityAt = studyAt ?? null;
      const sortAt =
        lastActivityAt && lastActivityAt > user.createdAt
          ? lastActivityAt
          : user.createdAt;

      return {
        row: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
          lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
          lastStudyAt: studyAt ? studyAt.toISOString() : null
        },
        sortAt
      };
    })
    .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
    .slice(0, 10)
    .map((item) => item.row);

  logEvent("info", "retention.ok", requestMeta);
  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      users: {
        total: totalUsers,
        createdLast7d: usersCreated7d,
        activeLast7d: activeUsers7d,
        activeLast30d: activeUsers30d
      },
      engagement: {
        studyThreads
      },
      recentUsers
    },
    { headers: PRIVATE_RESPONSE_HEADERS }
  );
}
