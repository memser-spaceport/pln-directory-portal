import { PROTOCOL_LABS_TEAM_UID } from '../team-news/team-news-public-list.config';

const PROTOCOL_LABS_TEAM_NAME = 'protocol labs';

export function isProtocolLabsTeam(team: { teamUid: string; name?: string }): boolean {
  if (team.teamUid === PROTOCOL_LABS_TEAM_UID) return true;
  return team.name?.trim().toLowerCase() === PROTOCOL_LABS_TEAM_NAME;
}

/** In-app Apply is off for Protocol Labs until the team job-refer email is set. */
export function isInAppApplyAvailable(team: {
  teamUid: string;
  name?: string;
  jobReferEmail?: string | null;
}): boolean {
  if (!isProtocolLabsTeam(team)) return true;
  return Boolean(team.jobReferEmail?.trim());
}

/** Pins Protocol Labs first when present, then slices the page. */
export function pinProtocolLabsThenPage<T extends { teamUid: string; name?: string }>(
  ordered: T[],
  page: number,
  limit: number
): T[] {
  const pinnedIndex = ordered.findIndex(isProtocolLabsTeam);
  const withPin =
    pinnedIndex > 0
      ? [ordered[pinnedIndex], ...ordered.slice(0, pinnedIndex), ...ordered.slice(pinnedIndex + 1)]
      : ordered;
  const skip = (page - 1) * limit;
  return withPin.slice(skip, skip + limit);
}
