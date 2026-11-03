import { Prisma } from '@prisma/client';

/**
 * The access level whose teams a logged-out visitor can't open: `findTeamByUid` answers them with
 * 403 "Team is inactive". L0 means the team was soft-deleted, or none of its members has ever logged in.
 */
export const PUBLICLY_HIDDEN_TEAM_ACCESS_LEVEL = 'L0';

/** Whether a logged-out visitor is refused this team's profile. */
export function isTeamHiddenFromPublic(accessLevel: string | null | undefined): boolean {
  return accessLevel === PUBLICLY_HIDDEN_TEAM_ACCESS_LEVEL;
}

/**
 * Teams a logged-out visitor can open: the same rule as `isTeamHiddenFromPublic`, as a query.
 *
 * `accessLevel` is nullable and a null team is public, but SQL's `<> 'L0'` drops NULL rows, so null is matched
 * explicitly (LAB-3085).
 */
export const PUBLICLY_VISIBLE_TEAM_WHERE: Prisma.TeamWhereInput = {
  OR: [{ accessLevel: null }, { accessLevel: { not: PUBLICLY_HIDDEN_TEAM_ACCESS_LEVEL } }],
};

/** The crawl index response: one `{ uid, updatedAt }` per publicly visible team. */
export function toTeamCrawlIndex(rows: { uid: string; updatedAt: Date }[]) {
  return {
    teams: rows.map((row) => ({ uid: row.uid, updatedAt: row.updatedAt.toISOString() })),
  };
}
