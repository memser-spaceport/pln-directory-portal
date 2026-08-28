import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { TeamNewsFollowSuggestionsResponse } from 'libs/contracts/src/schema/team-news';
import { FollowsService } from '../follows/follows.service';
import { PrismaService } from '../shared/prisma.service';
import { TEAM_NEWS_EXCLUDED_TEAM_NAMES } from './team-news-public-list.config';

const DEFAULT_SUGGESTION_LIMIT = 10;
const RECENT_NEWS_WINDOW_DAYS = 14;

type SharedAttrKind = 'focusArea' | 'communityAffiliation' | 'industryTag';

type TeamAttrs = {
  uid: string;
  teamFocusAreas: Array<{ ancestorArea: { title: string } }>;
  communityAffiliations: Array<{ title: string }>;
  industryTags: Array<{ title: string }>;
};

type CandidateTeam = TeamAttrs & {
  name: string;
  shortDescription: string | null;
  logo: { url: string } | null;
};

type InterestProfile = {
  seedUids: Set<string>;
  focusAreas: Set<string>;
  communityAffiliations: Set<string>;
  industryTags: Set<string>;
};

@Injectable()
export class TeamNewsSuggestionsService {
  constructor(private readonly prisma: PrismaService, private readonly followsService: FollowsService) {}

  /**
   * Personalized "Teams to follow" for the newsfeed sidebar.
   * Interest profile = attributes of teams the member belongs to + teams they follow.
   * Candidates must share an attribute, not already be followed/joined, and have
   * news in the last 14 days. Order is stable for a given member on a UTC calendar day.
   */
  async getFollowSuggestions(
    memberUid: string,
    limit: number = DEFAULT_SUGGESTION_LIMIT
  ): Promise<TeamNewsFollowSuggestionsResponse> {
    const profile = await this.loadInterestProfile(memberUid);
    const candidates = await this.findMatchingCandidates(profile);
    if (candidates.length === 0) {
      return { items: [] };
    }

    const dayKey = new Date().toISOString().slice(0, 10);
    const ranked = candidates
      .map((team) => {
        const shared = this.pickSharedAttribute(
          team,
          profile.focusAreas,
          profile.communityAffiliations,
          profile.industryTags
        );
        if (!shared) return null;
        return {
          team,
          sharedAttr: shared.title,
          sortKey: dayStableHash(`${memberUid}:${dayKey}:${team.uid}`),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => a.sortKey - b.sortKey || a.team.name.localeCompare(b.team.name))
      .slice(0, limit);

    const followerCounts = await this.followsService.countFollowersByTeam(ranked.map((r) => r.team.uid));

    return {
      items: ranked.map(({ team, sharedAttr }) => ({
        uid: team.uid,
        name: team.name,
        logo: team.logo?.url ?? null,
        shortDescription: team.shortDescription ?? null,
        reason: `${sharedAttr} · ${formatFollowerCount(followerCounts.get(team.uid) ?? 0)} followers`,
      })),
    };
  }

  /**
   * Team UIDs that belong on the newsfeed For You pill: memberships, follows,
   * and every Teams-to-follow match (uncapped — the sidebar still slices).
   */
  async getForYouTeamUids(memberUid: string): Promise<string[]> {
    const byMember = await this.getForYouTeamUidsForMembers([memberUid]);
    return byMember.get(memberUid) ?? [];
  }

  /**
   * Same union as getForYouTeamUids, batched so a digest job does not N+1.
   * Members with no memberships and no follows map to [].
   */
  async getForYouTeamUidsForMembers(memberUids: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    const uniqueMemberUids = [...new Set(memberUids)];
    for (const uid of uniqueMemberUids) {
      result.set(uid, []);
    }
    if (uniqueMemberUids.length === 0) {
      return result;
    }

    const [roles, followsByMember] = await Promise.all([
      this.prisma.teamMemberRole.findMany({
        where: { memberUid: { in: uniqueMemberUids } },
        select: { memberUid: true, teamUid: true },
      }),
      this.followsService.getFollowedTeamUidsByMembers(uniqueMemberUids),
    ]);

    const seedByMember = new Map<string, Set<string>>();
    for (const uid of uniqueMemberUids) {
      seedByMember.set(uid, new Set(followsByMember.get(uid) ?? []));
    }
    for (const role of roles) {
      seedByMember.get(role.memberUid)?.add(role.teamUid);
    }

    const membersWithSeeds = uniqueMemberUids.filter((uid) => (seedByMember.get(uid)?.size ?? 0) > 0);
    if (membersWithSeeds.length === 0) {
      return result;
    }

    const allSeedUids = [...new Set(membersWithSeeds.flatMap((uid) => [...(seedByMember.get(uid) ?? [])]))];
    const seedTeams = await this.prisma.team.findMany({
      where: { uid: { in: allSeedUids } },
      select: {
        uid: true,
        teamFocusAreas: { select: { ancestorArea: { select: { title: true } } } },
        communityAffiliations: { select: { title: true } },
        industryTags: { select: { title: true } },
      },
    });
    const seedTeamByUid = new Map(seedTeams.map((team) => [team.uid, team]));

    const profiles = new Map<string, InterestProfile>();
    let anyHasAttrs = false;
    for (const memberUid of membersWithSeeds) {
      const seedUids = seedByMember.get(memberUid) ?? new Set<string>();
      const focusAreas = new Set<string>();
      const communityAffiliations = new Set<string>();
      const industryTags = new Set<string>();
      for (const teamUid of seedUids) {
        const team = seedTeamByUid.get(teamUid);
        if (!team) continue;
        for (const tfa of team.teamFocusAreas) focusAreas.add(tfa.ancestorArea.title);
        for (const ca of team.communityAffiliations) communityAffiliations.add(ca.title);
        for (const tag of team.industryTags) industryTags.add(tag.title);
      }
      if (focusAreas.size > 0 || communityAffiliations.size > 0 || industryTags.size > 0) {
        anyHasAttrs = true;
      }
      profiles.set(memberUid, { seedUids, focusAreas, communityAffiliations, industryTags });
    }

    const universe = anyHasAttrs ? await this.loadRecentNewsCandidateUniverse() : [];

    for (const memberUid of uniqueMemberUids) {
      const profile = profiles.get(memberUid);
      if (!profile) continue;
      const candidateUids = universe
        .filter((team) => !profile.seedUids.has(team.uid))
        .filter((team) =>
          this.pickSharedAttribute(team, profile.focusAreas, profile.communityAffiliations, profile.industryTags)
        )
        .map((team) => team.uid);
      result.set(memberUid, [...new Set([...profile.seedUids, ...candidateUids])]);
    }

    return result;
  }

  private async loadInterestProfile(memberUid: string): Promise<InterestProfile> {
    const empty: InterestProfile = {
      seedUids: new Set(),
      focusAreas: new Set(),
      communityAffiliations: new Set(),
      industryTags: new Set(),
    };

    const [memberRoles, followedUids] = await Promise.all([
      this.prisma.teamMemberRole.findMany({
        where: { memberUid },
        select: { teamUid: true },
      }),
      this.followsService.getFollowedTeamUids(memberUid),
    ]);

    const seedUids = new Set([...memberRoles.map((r) => r.teamUid), ...followedUids]);
    if (seedUids.size === 0) {
      return empty;
    }

    const seedTeams = await this.prisma.team.findMany({
      where: { uid: { in: [...seedUids] } },
      select: {
        uid: true,
        teamFocusAreas: { select: { ancestorArea: { select: { title: true } } } },
        communityAffiliations: { select: { title: true } },
        industryTags: { select: { title: true } },
      },
    });

    const focusAreas = new Set<string>();
    const communityAffiliations = new Set<string>();
    const industryTags = new Set<string>();
    for (const team of seedTeams) {
      for (const tfa of team.teamFocusAreas) focusAreas.add(tfa.ancestorArea.title);
      for (const ca of team.communityAffiliations) communityAffiliations.add(ca.title);
      for (const tag of team.industryTags) industryTags.add(tag.title);
    }

    return { seedUids, focusAreas, communityAffiliations, industryTags };
  }

  private async findMatchingCandidates(profile: InterestProfile): Promise<CandidateTeam[]> {
    if (
      profile.seedUids.size === 0 ||
      (profile.focusAreas.size === 0 && profile.communityAffiliations.size === 0 && profile.industryTags.size === 0)
    ) {
      return [];
    }

    const since = new Date(Date.now() - RECENT_NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const orFilters: Array<Record<string, unknown>> = [];
    if (profile.focusAreas.size > 0) {
      orFilters.push({
        teamFocusAreas: { some: { ancestorArea: { title: { in: [...profile.focusAreas] } } } },
      });
    }
    if (profile.communityAffiliations.size > 0) {
      orFilters.push({
        communityAffiliations: { some: { title: { in: [...profile.communityAffiliations] } } },
      });
    }
    if (profile.industryTags.size > 0) {
      orFilters.push({
        industryTags: { some: { title: { in: [...profile.industryTags] } } },
      });
    }

    const excludedNameFilter =
      TEAM_NEWS_EXCLUDED_TEAM_NAMES.length > 0
        ? {
            NOT: {
              OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({
                name: { equals: name, mode: 'insensitive' as const },
              })),
            },
          }
        : {};

    const candidates = await this.prisma.team.findMany({
      where: {
        AND: [
          { uid: { notIn: [...profile.seedUids] } },
          { newsItems: { some: { eventDate: { gte: since } } } },
          { OR: orFilters },
          excludedNameFilter,
        ],
      },
      select: {
        uid: true,
        name: true,
        shortDescription: true,
        logo: { select: { url: true } },
        teamFocusAreas: { select: { ancestorArea: { select: { title: true } } } },
        communityAffiliations: { select: { title: true } },
        industryTags: { select: { title: true } },
      },
    });

    return candidates.filter((team) =>
      this.pickSharedAttribute(team, profile.focusAreas, profile.communityAffiliations, profile.industryTags)
    );
  }

  /** Teams with news in the last 14 days, minus the editorial exclusion list. */
  private async loadRecentNewsCandidateUniverse(): Promise<CandidateTeam[]> {
    const since = new Date(Date.now() - RECENT_NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const excludedNameFilter =
      TEAM_NEWS_EXCLUDED_TEAM_NAMES.length > 0
        ? {
            NOT: {
              OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({
                name: { equals: name, mode: 'insensitive' as const },
              })),
            },
          }
        : {};

    return this.prisma.team.findMany({
      where: {
        AND: [{ newsItems: { some: { eventDate: { gte: since } } } }, excludedNameFilter],
      },
      select: {
        uid: true,
        name: true,
        shortDescription: true,
        logo: { select: { url: true } },
        teamFocusAreas: { select: { ancestorArea: { select: { title: true } } } },
        communityAffiliations: { select: { title: true } },
        industryTags: { select: { title: true } },
      },
    });
  }

  private pickSharedAttribute(
    team: {
      teamFocusAreas: Array<{ ancestorArea: { title: string } }>;
      communityAffiliations: Array<{ title: string }>;
      industryTags: Array<{ title: string }>;
    },
    focusAreas: Set<string>,
    communityAffiliations: Set<string>,
    industryTags: Set<string>
  ): { kind: SharedAttrKind; title: string } | null {
    for (const tfa of team.teamFocusAreas) {
      if (focusAreas.has(tfa.ancestorArea.title)) {
        return { kind: 'focusArea', title: tfa.ancestorArea.title };
      }
    }
    for (const ca of team.communityAffiliations) {
      if (communityAffiliations.has(ca.title)) {
        return { kind: 'communityAffiliation', title: ca.title };
      }
    }
    for (const tag of team.industryTags) {
      if (industryTags.has(tag.title)) {
        return { kind: 'industryTag', title: tag.title };
      }
    }
    return null;
  }
}

/** Deterministic unsigned 32-bit hash for day-stable ordering. */
function dayStableHash(input: string): number {
  const digest = createHash('sha256').update(input).digest();
  return digest.readUInt32BE(0);
}

/** Prototype-style compact follower count (e.g. 1200 → "1.2k"). */
export function formatFollowerCount(count: number): string {
  if (count < 1000) return String(count);
  const thousands = count / 1000;
  const rounded = thousands >= 10 ? Math.round(thousands).toString() : thousands.toFixed(1).replace(/\.0$/, '');
  return `${rounded}k`;
}
