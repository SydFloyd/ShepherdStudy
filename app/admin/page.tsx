import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/admin-access";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: Date | null | undefined): string {
  if (!value) {
    return "-";
  }

  return value.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function sortByCountDesc<T extends { count: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.count - a.count);
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  const sessionEmail = session?.user?.email ?? null;

  if (!session?.user?.id || !sessionEmail) {
    redirect("/login");
  }

  if (!isAdminEmail(sessionEmail)) {
    redirect("/study");
  }

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    usersCreated7d,
    totalStudyThreads,
    totalWwjdThreads,
    totalUsageEvents,
    usageEvents24h,
    usageEvents7d,
    activeUsers7dRows,
    activeUsers30dRows,
    byFeatureRows,
    byActionRows,
    topUserRows,
    topAnonRows,
    topQuotaRows,
    recentUsers
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: { createdAt: { gte: sevenDaysAgo } }
    }),
    prisma.studyThread.count(),
    prisma.wwjdThread.count(),
    prisma.usageEvent.count(),
    prisma.usageEvent.count({
      where: { createdAt: { gte: oneDayAgo } }
    }),
    prisma.usageEvent.count({
      where: { createdAt: { gte: sevenDaysAgo } }
    }),
    prisma.usageEvent.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        userId: { not: null }
      },
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.usageEvent.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        userId: { not: null }
      },
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.usageEvent.groupBy({
      by: ["feature"],
      where: { createdAt: { gte: sevenDaysAgo } },
      _count: { _all: true },
      orderBy: { _count: { _all: "desc" } }
    }),
    prisma.usageEvent.groupBy({
      by: ["action"],
      where: { createdAt: { gte: oneDayAgo } },
      _count: { _all: true },
      orderBy: { _count: { _all: "desc" } },
      take: 12
    }),
    prisma.usageEvent.groupBy({
      by: ["userId"],
      where: {
        createdAt: { gte: sevenDaysAgo },
        userId: { not: null }
      },
      _count: { _all: true },
      orderBy: { _count: { _all: "desc" } },
      take: 20
    }),
    prisma.usageEvent.groupBy({
      by: ["anonId"],
      where: {
        createdAt: { gte: oneDayAgo },
        anonId: { not: null }
      },
      _count: { _all: true },
      orderBy: { _count: { _all: "desc" } },
      take: 20
    }),
    prisma.dailyQuotaUsage.findMany({
      where: {
        day: { gte: startOfToday },
        requestCount: { gt: 0 }
      },
      orderBy: [{ requestCount: "desc" }, { updatedAt: "desc" }],
      take: 20,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: {
          select: {
            studyThreads: true,
            wwjdThreads: true,
            usageEvents: true
          }
        }
      }
    })
  ]);

  const topUserIds = topUserRows
    .map((row) => row.userId)
    .filter((value): value is string => Boolean(value));
  const recentUserIds = recentUsers.map((user) => user.id);
  const userIdsToResolve = Array.from(new Set([...topUserIds, ...recentUserIds]));

  const [resolvedUsers, lastUsageByUser] = await Promise.all([
    userIdsToResolve.length > 0
      ? prisma.user.findMany({
          where: { id: { in: userIdsToResolve } },
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true
          }
        })
      : Promise.resolve([]),
    recentUserIds.length > 0
      ? prisma.usageEvent.groupBy({
          by: ["userId"],
          where: { userId: { in: recentUserIds } },
          _max: { createdAt: true }
        })
      : Promise.resolve([])
  ]);

  const userById = new Map(resolvedUsers.map((user) => [user.id, user]));
  const lastUsageByUserId = new Map<string, Date>();
  for (const row of lastUsageByUser) {
    if (!row.userId || !row._max.createdAt) {
      continue;
    }
    lastUsageByUserId.set(row.userId, row._max.createdAt);
  }

  const topUsers = sortByCountDesc(
    topUserRows
      .map((row) => {
        if (!row.userId) {
          return null;
        }
        const user = userById.get(row.userId);
        return {
          id: row.userId,
          name: user?.name ?? null,
          email: user?.email ?? "Unknown user",
          count: row._count._all
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
  );

  const topAnonymous = sortByCountDesc(
    topAnonRows
      .map((row) => {
        if (!row.anonId) {
          return null;
        }
        return {
          anonId: row.anonId,
          count: row._count._all
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
  );

  const recentUsersWithActivity = recentUsers.map((user) => ({
    ...user,
    lastActivityAt: lastUsageByUserId.get(user.id) ?? null
  }));

  return (
    <section className="grid adminGrid">
      <article className="card">
        <h1>Admin Overview</h1>
        <p className="muted">
          Signed in as {sessionEmail}. These metrics help detect unusual traffic and
          abusive usage patterns.
        </p>
        <p className="muted">Generated at {formatDate(now)}.</p>
      </article>

      <article className="card">
        <h2>Summary</h2>
        <div className="adminStatGrid">
          <div className="adminStatCard">
            <p className="adminStatLabel">Total users</p>
            <p className="adminStatValue">{formatCount(totalUsers)}</p>
          </div>
          <div className="adminStatCard">
            <p className="adminStatLabel">New users (7d)</p>
            <p className="adminStatValue">{formatCount(usersCreated7d)}</p>
          </div>
          <div className="adminStatCard">
            <p className="adminStatLabel">Active users (7d)</p>
            <p className="adminStatValue">{formatCount(activeUsers7dRows.length)}</p>
          </div>
          <div className="adminStatCard">
            <p className="adminStatLabel">Active users (30d)</p>
            <p className="adminStatValue">{formatCount(activeUsers30dRows.length)}</p>
          </div>
          <div className="adminStatCard">
            <p className="adminStatLabel">Usage events (24h)</p>
            <p className="adminStatValue">{formatCount(usageEvents24h)}</p>
          </div>
          <div className="adminStatCard">
            <p className="adminStatLabel">Usage events (7d)</p>
            <p className="adminStatValue">{formatCount(usageEvents7d)}</p>
          </div>
          <div className="adminStatCard">
            <p className="adminStatLabel">Study threads</p>
            <p className="adminStatValue">{formatCount(totalStudyThreads)}</p>
          </div>
          <div className="adminStatCard">
            <p className="adminStatLabel">WWJD threads</p>
            <p className="adminStatValue">{formatCount(totalWwjdThreads)}</p>
          </div>
          <div className="adminStatCard">
            <p className="adminStatLabel">Total usage events</p>
            <p className="adminStatValue">{formatCount(totalUsageEvents)}</p>
          </div>
        </div>
      </article>

      <article className="card">
        <h2>Usage Breakdown</h2>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Feature (7d)</th>
                <th>Events</th>
                <th>Action (24h)</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(
                {
                  length: Math.max(byFeatureRows.length, byActionRows.length, 1)
                },
                (_, index) => {
                  const feature = byFeatureRows[index];
                  const action = byActionRows[index];
                  return (
                    <tr key={`usage-breakdown-${index + 1}`}>
                      <td>{feature?.feature ?? "-"}</td>
                      <td>{feature ? formatCount(feature._count._all) : "-"}</td>
                      <td>{action?.action ?? "-"}</td>
                      <td>{action ? formatCount(action._count._all) : "-"}</td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Top Users by Usage (7d)</h2>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.length > 0 ? (
                topUsers.map((row) => (
                  <tr key={row.id}>
                    <td>{row.name ?? "-"}</td>
                    <td>{row.email}</td>
                    <td>{formatCount(row.count)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3}>No authenticated usage in the last 7 days.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Top Anonymous Traffic (24h)</h2>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Anon ID</th>
                <th>Events</th>
              </tr>
            </thead>
            <tbody>
              {topAnonymous.length > 0 ? (
                topAnonymous.map((row) => (
                  <tr key={row.anonId}>
                    <td className="adminMono">{row.anonId}</td>
                    <td>{formatCount(row.count)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2}>No anonymous traffic in the last 24 hours.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Quota Activity (Today)</h2>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Feature</th>
                <th>User</th>
                <th>Actor</th>
                <th>Daily Requests</th>
                <th>Window Requests</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {topQuotaRows.length > 0 ? (
                topQuotaRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.feature}</td>
                    <td>{row.user?.email ?? "-"}</td>
                    <td className="adminMono">{row.actorKey}</td>
                    <td>{formatCount(row.requestCount)}</td>
                    <td>{formatCount(row.windowCount)}</td>
                    <td>{formatDate(row.updatedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No quota activity recorded today.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card">
        <h2>Recent Users</h2>
        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Created</th>
                <th>Last activity</th>
                <th>Study threads</th>
                <th>WWJD threads</th>
                <th>Usage events</th>
              </tr>
            </thead>
            <tbody>
              {recentUsersWithActivity.map((user) => (
                <tr key={user.id}>
                  <td>{user.name ?? "-"}</td>
                  <td>{user.email}</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>{formatDate(user.lastActivityAt)}</td>
                  <td>{formatCount(user._count.studyThreads)}</td>
                  <td>{formatCount(user._count.wwjdThreads)}</td>
                  <td>{formatCount(user._count.usageEvents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}
