import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FollowEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import type {
  FollowStatusResponse,
  FollowedTeamsQuery,
  FollowedTeamsResponse,
  TeamFollowersQuery,
  TeamFollowersResponse,
} from 'libs/contracts/src/schema/follow';

/**
 * Follow feature data access. The persisted `Follow` edge is polymorphic
 * (`entityType` + `entityUid`); this service currently exposes only the
 * team-following surface. Member-following can be added by mirroring these
 * methods with `FollowEntityType.MEMBER` — no schema or query reshaping needed.
 */
@Injectable()
export class FollowsService {
  private readonly logger = new Logger(FollowsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Follow a team. Idempotent: re-following an already-followed team succeeds. */
  async followTeam(memberUid: string, teamUid: string): Promise<FollowStatusResponse> {
    await this.assertTeamExists(teamUid);

    await this.prisma.follow.upsert({
      where: {
        memberUid_entityType_entityUid: {
          memberUid,
          entityType: FollowEntityType.TEAM,
          entityUid: teamUid,
        },
      },
      create: { memberUid, entityType: FollowEntityType.TEAM, entityUid: teamUid },
      update: {},
    });

    return this.buildStatus(teamUid, true);
  }

  /** Unfollow a team. Idempotent: unfollowing a team not followed succeeds. */
  async unfollowTeam(memberUid: string, teamUid: string): Promise<FollowStatusResponse> {
    await this.assertTeamExists(teamUid);

    await this.prisma.follow.deleteMany({
      where: { memberUid, entityType: FollowEntityType.TEAM, entityUid: teamUid },
    });

    return this.buildStatus(teamUid, false);
  }

  /** Teams the member follows, newest-follow first. */
  async getFollowedTeams(memberUid: string, query: FollowedTeamsQuery): Promise<FollowedTeamsResponse> {
    const where: Prisma.FollowWhereInput = { memberUid, entityType: FollowEntityType.TEAM };
    const skip = (query.page - 1) * query.limit;

    const [follows, total] = await Promise.all([
      this.prisma.follow.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
      }),
      this.prisma.follow.count({ where }),
    ]);

    const teamUids = follows.map((f) => f.entityUid);
    const [teams, counts] = await Promise.all([
      this.prisma.team.findMany({
        where: { uid: { in: teamUids } },
        select: { uid: true, name: true, logo: { select: { url: true } } },
      }),
      this.countFollowersByTeam(teamUids),
    ]);
    const teamByUid = new Map(teams.map((t) => [t.uid, t]));

    // Preserve the follow-order (most recently followed first); drop any follow
    // whose team no longer exists (entityUid is not a hard FK — see schema).
    const items = follows
      .map((f) => {
        const team = teamByUid.get(f.entityUid);
        if (!team) return null;
        return {
          uid: team.uid,
          name: team.name,
          logoUrl: team.logo?.url ?? null,
          followedAt: f.createdAt.toISOString(),
          followerCount: counts.get(team.uid) ?? 0,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    return { page: query.page, limit: query.limit, total, items };
  }

  /**
   * Followers of a team. Restricted to members of that team and directory
   * admins (caller is resolved/authorized in the controller, which passes
   * `authorized`). Followers are returned newest-follow first.
   */
  async getTeamFollowers(
    teamUid: string,
    query: TeamFollowersQuery,
    authorized: boolean
  ): Promise<TeamFollowersResponse> {
    if (!authorized) {
      throw new ForbiddenException('Only members of this team can view its followers');
    }

    const team = await this.prisma.team.findUnique({ where: { uid: teamUid }, select: { uid: true, name: true } });
    if (!team) {
      throw new NotFoundException(`Team with uid ${teamUid} not found`);
    }

    const where: Prisma.FollowWhereInput = { entityType: FollowEntityType.TEAM, entityUid: teamUid };
    const skip = (query.page - 1) * query.limit;

    const [follows, total] = await Promise.all([
      this.prisma.follow.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: query.limit,
        include: { member: { select: { uid: true, name: true, image: { select: { url: true } } } } },
      }),
      this.prisma.follow.count({ where }),
    ]);

    return {
      teamUid: team.uid,
      teamName: team.name,
      page: query.page,
      limit: query.limit,
      total,
      items: follows.map((f) => ({
        uid: f.member.uid,
        name: f.member.name,
        imageUrl: f.member.image?.url ?? null,
        followedAt: f.createdAt.toISOString(),
      })),
    };
  }

  /**
   * UIDs of teams a member follows, as a Set — used to stamp an `isFollowed`
   * flag onto team / news listings without an N+1 per row.
   */
  async getFollowedTeamUids(memberUid: string): Promise<Set<string>> {
    const follows = await this.prisma.follow.findMany({
      where: { memberUid, entityType: FollowEntityType.TEAM },
      select: { entityUid: true },
    });
    return new Set(follows.map((f) => f.entityUid));
  }

  /** True when the member is part of the team (any active or historical role). */
  async isTeamMember(memberUid: string, teamUid: string): Promise<boolean> {
    const role = await this.prisma.teamMemberRole.findFirst({
      where: { memberUid, teamUid },
      select: { id: true },
    });
    return !!role;
  }

  private async assertTeamExists(teamUid: string): Promise<void> {
    const team = await this.prisma.team.findUnique({ where: { uid: teamUid }, select: { uid: true } });
    if (!team) {
      throw new NotFoundException(`Team with uid ${teamUid} not found`);
    }
  }

  private async buildStatus(teamUid: string, following: boolean): Promise<FollowStatusResponse> {
    const followerCount = await this.prisma.follow.count({
      where: { entityType: FollowEntityType.TEAM, entityUid: teamUid },
    });
    return { following, entityType: 'TEAM', entityUid: teamUid, followerCount };
  }

  private async countFollowersByTeam(teamUids: string[]): Promise<Map<string, number>> {
    if (teamUids.length === 0) return new Map();
    const grouped = await this.prisma.follow.groupBy({
      by: ['entityUid'],
      where: { entityType: FollowEntityType.TEAM, entityUid: { in: teamUids } },
      _count: { _all: true },
    });
    return new Map(grouped.map((g) => [g.entityUid, g._count._all]));
  }
}
