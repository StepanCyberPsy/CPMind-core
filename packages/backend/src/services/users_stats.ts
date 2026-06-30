import { sql, eq, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, tags, impressions } from '../db/schema.js';
import type { UserStatsRow, UserUuid, UserRole } from '@cpmind/shared';

interface UserStatsQueryRow {
  uuid: string;
  login: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  tagUuid: string | null;
  campaignsCount: string;
  creativesCount: string;
  impressionsCount: string;
  avgScore: number | null;
}

function toUserStatsRow(row: UserStatsQueryRow): UserStatsRow {
  return {
    uuid: row.uuid as UserUuid,
    login: row.login,
    role: row.role,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    tagUuid: row.tagUuid,
    campaignsCount: Number(row.campaignsCount),
    creativesCount: Number(row.creativesCount),
    impressionsCount: Number(row.impressionsCount),
    avgScore: row.avgScore,
  };
}

// Агрегированная статистика по каждому пользователю для страницы выбора юзера.
// LEFT JOIN — пользователи без единого импрешена не выпадают из списка. count(distinct ...) — campaign_id/creative_id повторяются у разных импрешенов одного юзера,
// count(*) считает все строки. avg(score_final) — double precision, NULL при отсутствии импрешенов, не требует ручной защиты от деления на ноль
// tagUuid — через подзапрос min(tags.uuid) по active-тегам, не через join на тот же запрос
// Прямой join на tags вместе с join на impressions дал бы декартово произведение (несколько тегов × несколько импрешенов на одного юзера), искажающее все count()/avg() выше
// Если у юзера несколько тегов — берётся один, детерминированно (минимальный uuid), без неопределённого порядка
export async function getUsersWithStats(): Promise<UserStatsRow[]> {
  const primaryTagSubquery = db
    .select({
      userId: tags.userId,
      tagUuid: sql<string>`min(${tags.uuid}::text)`.as('tag_uuid'),
    })
    .from(tags)
    .where(eq(tags.isActive, true))
    .groupBy(tags.userId)
    .as('primary_tag');

  const rows = await db
    .select({
      uuid: users.uuid,
      login: users.login,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      tagUuid: primaryTagSubquery.tagUuid,
      campaignsCount: sql<string>`count(distinct ${impressions.campaignId})`,
      creativesCount: sql<string>`count(distinct ${impressions.creativeId})`,
      impressionsCount: sql<string>`count(${impressions.id})`,
      avgScore: sql<number | null>`avg(${impressions.scoreFinal})`,
    })
    .from(users)
    .leftJoin(impressions, eq(impressions.userId, users.id))
    .leftJoin(primaryTagSubquery, eq(primaryTagSubquery.userId, users.id))
    .groupBy(users.id, primaryTagSubquery.tagUuid)
    .orderBy(desc(users.createdAt));

  return rows.map(toUserStatsRow);
}