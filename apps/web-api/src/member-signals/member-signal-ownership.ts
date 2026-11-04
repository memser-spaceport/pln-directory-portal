import type { PrismaClient } from '@prisma/client';
import type { MemberSignalEntityType } from './member-signals.constants';

type OwnershipPrisma = Pick<PrismaClient, 'teamMemberRole' | 'project' | 'teamNewsItem' | 'jobOpening'>;

/**
 * Decides the `own` flag of a signal row: the entity is the member, a team the
 * member has (or had) a role on, or something that belongs to them or their team.
 *
 * - MEMBER: the member itself
 * - TEAM: any team role of the member, current or past
 * - PROJECT: created by the member, or maintained by one of their teams
 * - NEWS_ITEM: posted by the member, or news of one of their teams
 * - JOB_OPENING: a role on one of their teams
 *
 * Lookups are cached for the lifetime of the resolver; the live writer uses a
 * fresh one per signal. The backfill migration
 * `20261104170000_backfill_member_signals` repeats these rules in SQL.
 */
export class MemberSignalOwnershipResolver {
  private readonly teamsByMember = new Map<string, Promise<Set<string>>>();
  private readonly projects = new Map<string, Promise<{ createdBy: string; maintainingTeamUid: string } | null>>();
  private readonly newsItems = new Map<string, Promise<{ teamUid: string; postedByMemberUid: string | null } | null>>();
  private readonly jobOpenings = new Map<string, Promise<{ teamUid: string | null } | null>>();

  constructor(private readonly prisma: OwnershipPrisma) {}

  async isOwn(memberUid: string, entityType: MemberSignalEntityType, entityUid: string): Promise<boolean> {
    switch (entityType) {
      case 'MEMBER':
        return entityUid === memberUid;
      case 'TEAM':
        return (await this.memberTeams(memberUid)).has(entityUid);
      case 'PROJECT': {
        const project = await this.cached(this.projects, entityUid, () =>
          this.prisma.project.findUnique({
            where: { uid: entityUid },
            select: { createdBy: true, maintainingTeamUid: true },
          })
        );
        if (!project) return false;
        return project.createdBy === memberUid || (await this.memberTeams(memberUid)).has(project.maintainingTeamUid);
      }
      case 'NEWS_ITEM': {
        const item = await this.cached(this.newsItems, entityUid, () =>
          this.prisma.teamNewsItem.findUnique({
            where: { uid: entityUid },
            select: { teamUid: true, postedByMemberUid: true },
          })
        );
        if (!item) return false;
        return item.postedByMemberUid === memberUid || (await this.memberTeams(memberUid)).has(item.teamUid);
      }
      case 'JOB_OPENING': {
        const job = await this.cached(this.jobOpenings, entityUid, () =>
          this.prisma.jobOpening.findUnique({ where: { uid: entityUid }, select: { teamUid: true } })
        );
        return !!job?.teamUid && (await this.memberTeams(memberUid)).has(job.teamUid);
      }
      default:
        return false;
    }
  }

  private memberTeams(memberUid: string): Promise<Set<string>> {
    return this.cached(this.teamsByMember, memberUid, async () => {
      const roles = await this.prisma.teamMemberRole.findMany({ where: { memberUid }, select: { teamUid: true } });
      return new Set(roles.map((role) => role.teamUid));
    });
  }

  private cached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
    let value = cache.get(key);
    if (!value) {
      value = load();
      cache.set(key, value);
    }
    return value;
  }
}
