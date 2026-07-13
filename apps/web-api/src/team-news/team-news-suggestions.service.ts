import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { TeamNewsFollowSuggestionsResponse } from 'libs/contracts/src/schema/team-news';
import { FollowsService } from '../follows/follows.service';
import { PrismaService } from '../shared/prisma.service';
import { TEAM_NEWS_EXCLUDED_TEAM_NAMES } from './team-news-public-list.config';

const DEFAULT_SUGGESTION_LIMIT = 10;
const RECENT_NEWS_WINDOW_DAYS = 14;

type SharedAttrKind = 'focusArea' | 'communityAffiliation' | 'industryTag';

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
    const [memberRoles, followedUids] = await Promise.all([
      this.prisma.teamMemberRole.findMany({
        where: { memberUid },
        select: { teamUid: true },
      }),
      this.followsService.getFollowedTeamUids(memberUid),
    ]);

    const membershipUids = new Set(memberRoles.map((r) => r.teamUid));
    const seedUids = new Set([...membershipUids, ...followedUids]);
    if (seedUids.size === 0) {
      return { items: [] };
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

    if (focusAreas.size === 0 && communityAffiliations.size === 0 && industryTags.size === 0) {
      return { items: [] };
    }

    const since = new Date(Date.now() - RECENT_NEWS_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const excludeSeed = [...seedUids];

    const orFilters: Array<Record<string, unknown>> = [];
    if (focusAreas.size > 0) {
      orFilters.push({
        teamFocusAreas: { some: { ancestorArea: { title: { in: [...focusAreas] } } } },
      });
    }
    if (communityAffiliations.size > 0) {
      orFilters.push({
        communityAffiliations: { some: { title: { in: [...communityAffiliations] } } },
      });
    }
    if (industryTags.size > 0) {
      orFilters.push({
        industryTags: { some: { title: { in: [...industryTags] } } },
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
          { uid: { notIn: excludeSeed } },
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

    if (candidates.length === 0) {
      return { items: [] };
    }

    const dayKey = new Date().toISOString().slice(0, 10);
    const ranked = candidates
      .map((team) => {
        const shared = this.pickSharedAttribute(team, focusAreas, communityAffiliations, industryTags);
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
