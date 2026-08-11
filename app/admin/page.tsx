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

function formatPercent(part: number, whole: number): string {
  if (whole <= 0) {
    return "0%";
  }
  return `${Math.round((part / whole) * 100)}%`;
}

function formatChange(current: number, previous: number): string {
  if (previous <= 0) {
    return current > 0 ? "New activity" : "No change";
  }

  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? "+" : ""}${change}%`;
}

function formatAverage(total: number, count: number): string {
  if (count <= 0) {
    return "0";
  }
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1
  }).format(total / count);
}

function AdminStatCard({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="adminStatCard">
      <p className="adminStatLabel">{label}</p>
      <p className="adminStatValue">{value}</p>
      {detail ? <p className="adminStatDetail">{detail}</p> : null}
    </div>
  );
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
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const [
    totalUsers,
    verifiedUsers,
    usersCreated24h,
    usersCreated7d,
    usersCreatedPrevious7d,
    totalStudyThreads,
    totalMemorizationPassages,
    totalMemorizationAttempts,
    memorizationUserRows,
    totalUsageEvents,
    usageEvents24h,
    usageEventsPrevious24h,
    usageEvents7d,
    usageEventsPrevious7d,
    authenticatedUsageEvents24h,
    anonymousUsageEvents24h,
    activeAnonymous24hRows,
    activeUsers7dRows,
    activeUsers30dRows,
    byFeatureRows,
    byActionRows,
    accountTierRows,
    topUserRows,
    topAnonRows,
    topQuotaRows,
    quotaToday,
    recentUsers
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({
      where: { emailVerifiedAt: { not: null } }
    }),
    prisma.user.count({
      where: { createdAt: { gte: oneDayAgo } }
    }),
    prisma.user.count({
      where: { createdAt: { gte: sevenDaysAgo } }
    }),
    prisma.user.count({
      where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } }
    }),
    prisma.studyThread.count(),
    prisma.memorizationPassage.count(),
    prisma.memorizationAttempt.count(),
    prisma.memorizationPassage.findMany({
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.usageEvent.count(),
    prisma.usageEvent.count({
      where: { createdAt: { gte: oneDayAgo } }
    }),
    prisma.usageEvent.count({
      where: { createdAt: { gte: twoDaysAgo, lt: oneDayAgo } }
    }),
    prisma.usageEvent.count({
      where: { createdAt: { gte: sevenDaysAgo } }
    }),
    prisma.usageEvent.count({
      where: { createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo } }
    }),
    prisma.usageEvent.count({
      where: {
        createdAt: { gte: oneDayAgo },
        userId: { not: null }
      }
    }),
    prisma.usageEvent.count({
      where: {
        createdAt: { gte: oneDayAgo },
        userId: null
      }
    }),
    prisma.usageEvent.findMany({
      where: {
        createdAt: { gte: oneDayAgo },
        userId: null,
        anonId: { not: null }
      },
      distinct: ["anonId"],
      select: { anonId: true }
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
      orderBy: { _count: { id: "desc" } }
    }),
    prisma.usageEvent.groupBy({
      by: ["action"],
      where: { createdAt: { gte: oneDayAgo } },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 12
    }),
    prisma.user.groupBy({
      by: ["accountTier"],
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } }
    }),
    prisma.usageEvent.groupBy({
      by: ["userId"],
      where: {
        createdAt: { gte: sevenDaysAgo },
        userId: { not: null }
      },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 20
    }),
    prisma.usageEvent.groupBy({
      by: ["anonId"],
      where: {
        createdAt: { gte: oneDayAgo },
        userId: null,
        anonId: { not: null }
      },
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
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
    prisma.dailyQuotaUsage.aggregate({
      where: {
        day: { gte: startOfToday },
        requestCount: { gt: 0 }
      },
      _sum: {
        requestCount: true,
        tokenCount: true
      },
      _max: {
        requestCount: true
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
      <article className="card adminHeaderCard">
        <div className="adminHeaderRow">
          <div>
            <h1>Admin Overview</h1>
            <p className="muted adminHeaderTimestamp">
              Generated at {formatDate(now)}
            </p>
          </div>
          <span className="adminAccessBadge">Restricted access</span>
        </div>
        <p className="muted">
          Signed in as {sessionEmail}. Server-side access is limited to emails in
          the configured admin allowlist.
        </p>
        <nav className="adminQuickLinks" aria-label="Admin sections">
          <a href="#summary">Summary</a>
          <a href="#activity">Activity</a>
          <a href="#usage">Usage</a>
          <a href="#audience">Audience</a>
          <a href="#quotas">Quotas</a>
          <a href="#users">Users</a>
        </nav>
      </article>

      <article className="card" id="summary">
        <h2>Summary</h2>
        <div className="adminStatGrid">
          <AdminStatCard
            label="Total users"
            value={formatCount(totalUsers)}
            detail={`${formatPercent(verifiedUsers, totalUsers)} email verified`}
          />
          <AdminStatCard
            label="New users (7d)"
            value={formatCount(usersCreated7d)}
            detail={`${formatChange(usersCreated7d, usersCreatedPrevious7d)} vs prior 7d`}
          />
          <AdminStatCard
            label="Active users (7d)"
            value={formatCount(activeUsers7dRows.length)}
            detail={`${formatPercent(activeUsers7dRows.length, totalUsers)} of accounts`}
          />
          <AdminStatCard
            label="Active users (30d)"
            value={formatCount(activeUsers30dRows.length)}
            detail={`${formatPercent(activeUsers30dRows.length, totalUsers)} of accounts`}
          />
          <AdminStatCard
            label="Usage events (24h)"
            value={formatCount(usageEvents24h)}
            detail={`${formatChange(usageEvents24h, usageEventsPrevious24h)} vs prior 24h`}
          />
          <AdminStatCard
            label="Usage events (7d)"
            value={formatCount(usageEvents7d)}
            detail={`${formatChange(usageEvents7d, usageEventsPrevious7d)} vs prior 7d`}
          />
          <AdminStatCard
            label="Study threads"
            value={formatCount(totalStudyThreads)}
            detail={`${formatAverage(totalStudyThreads, totalUsers)} per user`}
          />
          <AdminStatCard
            label="Saved passages"
            value={formatCount(totalMemorizationPassages)}
            detail={`${formatCount(memorizationUserRows.length)} users · ${formatCount(totalMemorizationAttempts)} attempts`}
          />
          <AdminStatCard
            label="Quota requests today"
            value={formatCount(quotaToday._sum.requestCount ?? 0)}
            detail={`Peak actor ${formatCount(quotaToday._max.requestCount ?? 0)} · ${formatCount(quotaToday._sum.tokenCount ?? 0)} tokens`}
          />
          <AdminStatCard
            label="Total usage events"
            value={formatCount(totalUsageEvents)}
          />
        </div>
      </article>

      <article className="card" id="activity">
        <h2>Activity Pulse</h2>
        <div className="adminInsightGrid">
          <section className="adminInsightPanel">
            <h3>Last 24 hours</h3>
            <dl className="adminMetricList">
              <div>
                <dt>New accounts</dt>
                <dd>{formatCount(usersCreated24h)}</dd>
              </div>
              <div>
                <dt>Signed-in events</dt>
                <dd>
                  {formatCount(authenticatedUsageEvents24h)}
                  <span>{formatPercent(authenticatedUsageEvents24h, usageEvents24h)}</span>
                </dd>
              </div>
              <div>
                <dt>Anonymous events</dt>
                <dd>
                  {formatCount(anonymousUsageEvents24h)}
                  <span>{formatPercent(anonymousUsageEvents24h, usageEvents24h)}</span>
                </dd>
              </div>
              <div>
                <dt>Distinct anonymous visitors</dt>
                <dd>{formatCount(activeAnonymous24hRows.length)}</dd>
              </div>
            </dl>
          </section>

          <section className="adminInsightPanel">
            <h3>Account tiers</h3>
            <dl className="adminMetricList">
              {accountTierRows.length > 0 ? (
                accountTierRows.map((row) => (
                  <div key={row.accountTier}>
                    <dt>{row.accountTier.toLowerCase()}</dt>
                    <dd>
                      {formatCount(row._count._all)}
                      <span>{formatPercent(row._count._all, totalUsers)}</span>
                    </dd>
                  </div>
                ))
              ) : (
                <div>
                  <dt>Accounts</dt>
                  <dd>0</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="adminInsightPanel">
            <h3>Memorization adoption</h3>
            <dl className="adminMetricList">
              <div>
                <dt>Users with saved passages</dt>
                <dd>
                  {formatCount(memorizationUserRows.length)}
                  <span>{formatPercent(memorizationUserRows.length, totalUsers)}</span>
                </dd>
              </div>
              <div>
                <dt>Saved passages</dt>
                <dd>{formatCount(totalMemorizationPassages)}</dd>
              </div>
              <div>
                <dt>Practice attempts</dt>
                <dd>{formatCount(totalMemorizationAttempts)}</dd>
              </div>
            </dl>
          </section>
        </div>
      </article>

      <article className="card" id="usage">
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

      <article className="card" id="audience">
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

      <article className="card" id="quotas">
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

      <article className="card" id="users">
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
