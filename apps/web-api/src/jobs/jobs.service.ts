import { Injectable } from '@nestjs/common';
import { JobOpeningStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import type { JobsListQuery } from 'libs/contracts/src/schema/job-opening';

type RoleRow = {
  id: number;
  uid: string;
  roleTitle: string;
  roleCategory: string | null;
  seniority: string | null;
  location: string | null;
  sourceLink: string | null;
  postedDate: Date | null;
  updatedAt: Date;
  dwCompanyId: string | null;
};

type GroupAccumulator = {
  teamUid: string;
  sortKey: Date;
  roles: RoleRow[];
};

type FacetOverrides = {
  dropFunction?: boolean;
  dropSeniority?: boolean;
  dropFocus?: boolean;
  dropLocation?: boolean;
  dropQ?: boolean;
};

const encodeCursor = (offset: number) => Buffer.from(String(offset), 'utf8').toString('base64url');

const decodeCursor = (cursor: string | undefined): number => {
  if (!cursor) return 0;
  const parsed = Number.parseInt(Buffer.from(cursor, 'base64url').toString('utf8'), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const NO_MATCH: Prisma.StringNullableFilter = { in: ['__none__'] };

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTeamUidsByFocusTitles(focusTitles: string[]): Promise<string[] | null> {
    if (focusTitles.length === 0) return null;
    const rows = await this.prisma.teamFocusArea.findMany({
      where: {
        OR: [
          { ancestorArea: { title: { in: focusTitles } } },
          { focusArea: { title: { in: focusTitles } } },
        ],
      },
      select: { teamUid: true },
      distinct: ['teamUid'],
    });
    return rows.map((r) => r.teamUid);
  }

  private async resolveTeamUidsByNameSearch(q: string | undefined): Promise<string[] | null> {
    if (!q) return null;
    const rows = await this.prisma.team.findMany({
      where: { name: { contains: q, mode: 'insensitive' } },
      select: { uid: true },
    });
    return rows.map((r) => r.uid);
  }

  private buildWhere(
    query: JobsListQuery,
    focusTeamUids: string[] | null,
    qTeamUids: string[] | null,
    overrides: FacetOverrides = {},
  ): Prisma.JobOpeningWhereInput {
    const where: Prisma.JobOpeningWhereInput = {
      status: { not: JobOpeningStatus.STALE },
    };

    if (!overrides.dropQ && query.q) {
      const roleMatch: Prisma.JobOpeningWhereInput = {
        roleTitle: { contains: query.q, mode: 'insensitive' },
      };
      const teamMatch: Prisma.JobOpeningWhereInput | null =
        qTeamUids && qTeamUids.length > 0 ? { dwCompanyId: { in: qTeamUids } } : null;
      where.OR = teamMatch ? [roleMatch, teamMatch] : [roleMatch];
    }
    if (!overrides.dropFunction && query.roleCategory.length > 0) {
      where.roleCategory = { in: query.roleCategory };
    }
    if (!overrides.dropSeniority && query.seniority.length > 0) {
      where.seniority = { in: query.seniority };
    }
    if (!overrides.dropLocation && query.location.length > 0) {
      where.location = { in: query.location };
    }

    if (!overrides.dropFocus && focusTeamUids !== null) {
      where.dwCompanyId = focusTeamUids.length > 0 ? { in: focusTeamUids } : NO_MATCH;
    }

    return where;
  }

  private async resolveFocusTeamUids(
    query: JobsListQuery,
    overrides: FacetOverrides = {},
  ): Promise<string[] | null> {
    if (overrides.dropFocus) return null;
    return this.resolveTeamUidsByFocusTitles(query.focus);
  }

  async listJobs(query: JobsListQuery) {
    const [focusTeamUids, qTeamUids] = await Promise.all([
      this.resolveFocusTeamUids(query),
      this.resolveTeamUidsByNameSearch(query.q),
    ]);
    const where = this.buildWhere(query, focusTeamUids, qTeamUids);

    const roles = (await this.prisma.jobOpening.findMany({
      where,
      select: {
        id: true,
        uid: true,
        roleTitle: true,
        roleCategory: true,
        seniority: true,
        location: true,
        sourceLink: true,
        postedDate: true,
        updatedAt: true,
        dwCompanyId: true,
      },
      orderBy: { updatedAt: 'desc' },
    })) as RoleRow[];

    const groups = new Map<string, GroupAccumulator>();
    for (const role of roles) {
      if (!role.dwCompanyId) continue;
      const existing = groups.get(role.dwCompanyId);
      if (existing) {
        existing.roles.push(role);
        if (role.updatedAt > existing.sortKey) existing.sortKey = role.updatedAt;
      } else {
        groups.set(role.dwCompanyId, {
          teamUid: role.dwCompanyId,
          sortKey: role.updatedAt,
          roles: [role],
        });
      }
    }

    const teamUids = [...groups.keys()];
    const [teams, focusRows] = await Promise.all([
      this.prisma.team.findMany({
        where: { uid: { in: teamUids } },
        select: {
          uid: true,
          name: true,
          logo: { select: { url: true } },
        },
      }),
      this.prisma.teamFocusArea.findMany({
        where: { teamUid: { in: teamUids } },
        select: {
          teamUid: true,
          focusAreaUid: true,
          ancestorAreaUid: true,
          focusArea: { select: { title: true } },
          ancestorArea: { select: { title: true } },
        },
      }),
    ]);

    const teamByUid = new Map(teams.map((t) => [t.uid, t]));
    const ancestorByTeam = new Map<string, Map<string, string>>();
    const leafByTeam = new Map<string, Map<string, string>>();
    for (const row of focusRows) {
      if (!ancestorByTeam.has(row.teamUid)) ancestorByTeam.set(row.teamUid, new Map());
      if (!leafByTeam.has(row.teamUid)) leafByTeam.set(row.teamUid, new Map());
      ancestorByTeam.get(row.teamUid)!.set(row.ancestorAreaUid, row.ancestorArea.title);
      leafByTeam.get(row.teamUid)!.set(row.focusAreaUid, row.focusArea.title);
    }

    const hydratedGroups: GroupAccumulator[] = [];
    for (const group of groups.values()) {
      if (!teamByUid.has(group.teamUid)) continue;
      hydratedGroups.push(group);
    }

    if (query.sort === 'company_az') {
      hydratedGroups.sort((a, b) => {
        const na = teamByUid.get(a.teamUid)?.name.toLowerCase() ?? '';
        const nb = teamByUid.get(b.teamUid)?.name.toLowerCase() ?? '';
        return na.localeCompare(nb);
      });
    } else {
      hydratedGroups.sort((a, b) => b.sortKey.getTime() - a.sortKey.getTime());
    }

    const totalGroups = hydratedGroups.length;
    const totalRoles = hydratedGroups.reduce((sum, g) => sum + g.roles.length, 0);

    const offset = decodeCursor(query.cursor);
    const slice = hydratedGroups.slice(offset, offset + query.limit);
    const nextOffset = offset + slice.length;
    const nextCursor = nextOffset < hydratedGroups.length ? encodeCursor(nextOffset) : null;

    const responseGroups = slice.map((g) => {
      const team = teamByUid.get(g.teamUid);
      if (!team) {
        throw new Error(`Team ${g.teamUid} missing after hydration guard`);
      }
      const focusAreas = [...(ancestorByTeam.get(team.uid)?.values() ?? [])].sort((a, b) => a.localeCompare(b));
      const subFocusAreas = [...(leafByTeam.get(team.uid)?.values() ?? [])].sort((a, b) => a.localeCompare(b));
      return {
        team: {
          uid: team.uid,
          name: team.name,
          logoUrl: team.logo?.url ?? null,
          focusAreas,
          subFocusAreas,
        },
        totalRoles: g.roles.length,
        roles: g.roles.map((role) => ({
          uid: role.uid,
          roleTitle: role.roleTitle,
          roleCategory: role.roleCategory,
          seniority: role.seniority,
          location: role.location,
          applyUrl: role.sourceLink,
          lastUpdated: role.updatedAt.toISOString(),
          postedDate: role.postedDate ? role.postedDate.toISOString() : null,
        })),
      };
    });

    return {
      groups: responseGroups,
      nextCursor,
      totalGroups,
      totalRoles,
    };
  }

  async getFilters(query: JobsListQuery) {
    const [fullFocusTeamUids, focusDroppedTeamUids, qTeamUids] = await Promise.all([
      this.resolveFocusTeamUids(query),
      this.resolveFocusTeamUids(query, { dropFocus: true }),
      this.resolveTeamUidsByNameSearch(query.q),
    ]);

    const functionWhere = this.buildWhere(query, fullFocusTeamUids, qTeamUids, { dropFunction: true });
    const seniorityWhere = this.buildWhere(query, fullFocusTeamUids, qTeamUids, { dropSeniority: true });
    const locationWhere = this.buildWhere(query, fullFocusTeamUids, qTeamUids, { dropLocation: true });
    const focusWhere = this.buildWhere(query, focusDroppedTeamUids, qTeamUids, { dropFocus: true });

    const [roleCategoryCounts, seniorityCounts, locationCounts, focusTree] = await Promise.all([
      this.countByField('roleCategory', functionWhere),
      this.countByField('seniority', seniorityWhere, (v) => v !== 'Unknown'),
      this.countByField('location', locationWhere),
      this.buildFocusTree(focusWhere),
    ]);

    return {
      roleCategory: roleCategoryCounts,
      seniority: seniorityCounts,
      location: locationCounts,
      focus: focusTree,
    };
  }

  private async countByField(
    field: 'roleCategory' | 'seniority' | 'location',
    where: Prisma.JobOpeningWhereInput,
    include?: (value: string) => boolean,
  ) {
    const scopedWhere: Prisma.JobOpeningWhereInput = { ...where, [field]: { not: null } };
    const rows = await this.prisma.jobOpening.groupBy({
      by: [field],
      where: scopedWhere,
      _count: { _all: true },
    });
    return rows
      .map((r) => ({ value: (r as any)[field] as string, count: r._count._all }))
      .filter((r) => r.value && (include ? include(r.value) : true))
      .sort((a, b) => a.value.localeCompare(b.value));
  }

  private async buildFocusTree(where: Prisma.JobOpeningWhereInput) {
    const rowsByTeam = await this.prisma.jobOpening.groupBy({
      by: ['dwCompanyId'],
      where: { ...where, dwCompanyId: { not: null } },
      _count: { _all: true },
    });

    const jobsByTeam = new Map<string, number>();
    for (const row of rowsByTeam) {
      if (!row.dwCompanyId) continue;
      jobsByTeam.set(row.dwCompanyId, row._count._all);
    }
    if (jobsByTeam.size === 0) return [];

    const tfa = await this.prisma.teamFocusArea.findMany({
      where: { teamUid: { in: [...jobsByTeam.keys()] } },
      select: {
        teamUid: true,
        focusAreaUid: true,
        ancestorAreaUid: true,
        focusArea: { select: { title: true } },
        ancestorArea: { select: { title: true } },
      },
    });

    // Dedupe (teamUid, ancestor) and (teamUid, leaf) so a team with many leaves sharing an ancestor isn't double-counted.
    const ancestorSeen = new Set<string>();
    const ancestorCount = new Map<string, number>();
    const leafSeen = new Set<string>();
    const leafCount = new Map<string, { title: string; parentTitle: string; count: number }>();

    for (const row of tfa) {
      const delta = jobsByTeam.get(row.teamUid) ?? 0;
      const ancestorKey = `${row.teamUid}::${row.ancestorAreaUid}`;
      if (!ancestorSeen.has(ancestorKey)) {
        ancestorSeen.add(ancestorKey);
        ancestorCount.set(
          row.ancestorArea.title,
          (ancestorCount.get(row.ancestorArea.title) ?? 0) + delta,
        );
      }
      const leafKey = `${row.teamUid}::${row.focusAreaUid}`;
      if (!leafSeen.has(leafKey)) {
        leafSeen.add(leafKey);
        const existing = leafCount.get(row.focusArea.title);
        leafCount.set(row.focusArea.title, {
          title: row.focusArea.title,
          parentTitle: row.ancestorArea.title,
          count: (existing?.count ?? 0) + delta,
        });
      }
    }

    const childrenByParent = new Map<string, { value: string; count: number }[]>();
    for (const leaf of leafCount.values()) {
      // Don't list the ancestor as its own child.
      if (leaf.title === leaf.parentTitle) continue;
      if (!childrenByParent.has(leaf.parentTitle)) childrenByParent.set(leaf.parentTitle, []);
      childrenByParent.get(leaf.parentTitle)!.push({ value: leaf.title, count: leaf.count });
    }
    for (const arr of childrenByParent.values()) arr.sort((a, b) => a.value.localeCompare(b.value));

    return [...ancestorCount.entries()]
      .map(([value, count]) => ({
        value,
        count,
        children: childrenByParent.get(value) ?? [],
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }
}
