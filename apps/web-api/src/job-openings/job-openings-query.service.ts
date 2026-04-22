import { Injectable } from '@nestjs/common';
import { JobOpeningStatus, Prisma } from '@prisma/client';
import type { JobsListQuery } from 'libs/contracts/src/schema/job-opening';
import { PrismaService } from '../shared/prisma.service';

type PagedTeamGroupRow = {
  teamUid: string;
  roleCount: number;
};

type FacetOverrides = {
  dropFunction?: boolean;
  dropSeniority?: boolean;
  dropFocus?: boolean;
  dropLocation?: boolean;
  dropQ?: boolean;
};

@Injectable()
export class JobOpeningsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(query: JobsListQuery, overrides: FacetOverrides = {}): Prisma.JobOpeningWhereInput {
    const and: Prisma.JobOpeningWhereInput[] = [];

    if (!overrides.dropQ && query.q) {
      and.push({
        OR: [
          { roleTitle: { contains: query.q, mode: 'insensitive' } },
          { team: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      });
    }

    if (!overrides.dropFunction && query.roleCategory.length > 0) {
      and.push({ roleCategory: { in: query.roleCategory } });
    }

    if (!overrides.dropSeniority && query.seniority.length > 0) {
      and.push({ seniority: { in: query.seniority } });
    }

    if (!overrides.dropLocation && query.location.length > 0) {
      and.push({ location: { in: query.location } });
    }

    if (!overrides.dropFocus && query.focus.length > 0) {
      and.push({
        team: {
          teamFocusAreas: {
            some: {
              OR: [{ ancestorArea: { title: { in: query.focus } } }, { focusArea: { title: { in: query.focus } } }],
            },
          },
        },
      });
    }

    return {
      status: { not: JobOpeningStatus.STALE },
      teamUid: { not: null },
      ...(and.length > 0 ? { AND: and } : {}),
    };
  }

  private async queryPagedTeamGroups(query: JobsListQuery) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(query);
    const [totalGroups, totalRoles] = await Promise.all([
      this.prisma.team.count({
        where: {
          jobOpenings: {
            some: where,
          },
        },
      }),
      this.prisma.jobOpening.count({ where }),
    ]);

    if (totalGroups === 0) {
      return {
        pageRows: [],
        totalGroups,
        totalRoles,
      };
    }

    const groupByTeamUid = this.prisma.jobOpening.groupBy as unknown as (args: {
      by: ['teamUid'];
      where: Prisma.JobOpeningWhereInput;
      _count: { _all: true };
      _max?: { updatedAt: true };
      orderBy?: Prisma.JobOpeningOrderByWithAggregationInput[];
      skip?: number;
      take?: number;
    }) => Promise<{ teamUid: string | null; _count: { _all: number } }[]>;

    let pageRows: PagedTeamGroupRow[] = [];
    if (query.sort === 'company_az') {
      const teamsPage = await this.prisma.team.findMany({
        where: {
          jobOpenings: {
            some: where,
          },
        },
        select: { uid: true },
        orderBy: [{ name: 'asc' }, { uid: 'asc' }],
        skip,
        take: limit,
      });
      const pageTeamUids = teamsPage.map((team) => team.uid);

      if (pageTeamUids.length > 0) {
        const counts = await groupByTeamUid({
          by: ['teamUid'],
          where: {
            ...where,
            teamUid: { in: pageTeamUids },
          },
          _count: { _all: true },
        });
        const countByTeamUid = new Map(
          counts
            .filter((row): row is { teamUid: string; _count: { _all: number } } => Boolean(row.teamUid))
            .map((row) => [row.teamUid, row._count._all])
        );

        pageRows = pageTeamUids.map((teamUid) => ({
          teamUid,
          roleCount: countByTeamUid.get(teamUid) ?? 0,
        }));
      }
    } else {
      const rows = await groupByTeamUid({
        by: ['teamUid'],
        where,
        _count: { _all: true },
        _max: { updatedAt: true },
        orderBy: [{ _max: { updatedAt: 'desc' } }, { teamUid: 'asc' }],
        skip,
        take: limit,
      });

      pageRows = rows
        .filter((row): row is { teamUid: string; _count: { _all: number } } => Boolean(row.teamUid))
        .map((row) => ({
          teamUid: row.teamUid,
          roleCount: row._count._all,
        }));
    }

    return {
      pageRows,
      totalGroups,
      totalRoles,
    };
  }

  async listJobOpenings(query: JobsListQuery) {
    const page = query.page;
    const limit = query.limit;
    const where = this.buildWhere(query);
    const { pageRows, totalGroups, totalRoles } = await this.queryPagedTeamGroups(query);

    if (totalGroups === 0) {
      return {
        page,
        limit,
        total: 0,
        groups: [],
        totalGroups: 0,
        totalRoles: 0,
      };
    }

    const pageTeamUids = pageRows.map((group) => group.teamUid);
    const roleCountByTeamUid = new Map(pageRows.map((group) => [group.teamUid, group.roleCount]));

    if (pageTeamUids.length === 0) {
      return {
        page,
        limit,
        total: totalGroups,
        groups: [],
        totalGroups,
        totalRoles,
      };
    }

    const [pageTeams, focusRows] = await Promise.all([
      this.prisma.team.findMany({
        where: { uid: { in: pageTeamUids } },
        select: {
          uid: true,
          name: true,
          logo: { select: { url: true } },
          jobOpenings: {
            where,
            select: {
              uid: true,
              teamUid: true,
              roleTitle: true,
              roleCategory: true,
              seniority: true,
              location: true,
              sourceLink: true,
              postedDate: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
          },
        },
      }),
      this.prisma.teamFocusArea.findMany({
        where: { teamUid: { in: pageTeamUids } },
        select: {
          teamUid: true,
          focusAreaUid: true,
          ancestorAreaUid: true,
          focusArea: { select: { title: true } },
          ancestorArea: { select: { title: true } },
        },
      }),
    ]);

    const teamByUid = new Map(pageTeams.map((team) => [team.uid, team]));

    const ancestorByTeam = new Map<string, Map<string, string>>();
    const leafByTeam = new Map<string, Map<string, string>>();
    for (const row of focusRows) {
      if (!ancestorByTeam.has(row.teamUid)) ancestorByTeam.set(row.teamUid, new Map());
      if (!leafByTeam.has(row.teamUid)) leafByTeam.set(row.teamUid, new Map());
      ancestorByTeam.get(row.teamUid)?.set(row.ancestorAreaUid, row.ancestorArea.title);
      leafByTeam.get(row.teamUid)?.set(row.focusAreaUid, row.focusArea.title);
    }

    const responseGroups = pageRows
      .map((group) => {
        const team = teamByUid.get(group.teamUid);
        if (!team) return null;

        const teamRoles = team.jobOpenings;
        const focusAreas = [...(ancestorByTeam.get(group.teamUid)?.values() ?? [])].sort((a, b) => a.localeCompare(b));
        const subFocusAreas = [...(leafByTeam.get(group.teamUid)?.values() ?? [])].sort((a, b) => a.localeCompare(b));

        return {
          team: {
            uid: team.uid,
            name: team.name,
            logoUrl: team.logo?.url ?? null,
            focusAreas,
            subFocusAreas,
          },
          totalRoles: roleCountByTeamUid.get(group.teamUid) ?? teamRoles.length,
          roles: teamRoles.map((role) => ({
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
      })
      .filter((group): group is NonNullable<typeof group> => Boolean(group));

    return {
      page,
      limit,
      total: totalGroups,
      groups: responseGroups,
      totalGroups,
      totalRoles,
    };
  }

  async getFilters(query: JobsListQuery) {
    const functionWhere = this.buildWhere(query, { dropFunction: true });
    const seniorityWhere = this.buildWhere(query, { dropSeniority: true });
    const locationWhere = this.buildWhere(query, { dropLocation: true });
    const focusWhere = this.buildWhere(query, { dropFocus: true });

    const [roleCategoryCounts, seniorityCounts, locationCounts, focusTree] = await Promise.all([
      this.countByField('roleCategory', functionWhere),
      this.countByField('seniority', seniorityWhere, (value) => value !== 'Unknown'),
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
    include?: (value: string) => boolean
  ) {
    const scopedWhere: Prisma.JobOpeningWhereInput = { ...where, [field]: { not: null } };
    const rows = await this.prisma.jobOpening.groupBy({
      by: [field],
      where: scopedWhere,
      _count: { _all: true },
    });

    return rows
      .map((row) => {
        const value =
          field === 'roleCategory' ? row.roleCategory : field === 'seniority' ? row.seniority : row.location;
        return {
          value,
          count: row._count._all,
        };
      })
      .filter((row): row is { value: string; count: number } => Boolean(row.value))
      .filter((row) => (include ? include(row.value) : true))
      .sort((a, b) => a.value.localeCompare(b.value));
  }

  private async buildFocusTree(where: Prisma.JobOpeningWhereInput) {
    const rowsByTeam = await this.prisma.jobOpening.groupBy({
      by: ['teamUid'],
      where: { ...where, teamUid: { not: null } },
      _count: { _all: true },
    });

    const jobsByTeam = new Map<string, number>();
    for (const row of rowsByTeam) {
      if (!row.teamUid) continue;
      jobsByTeam.set(row.teamUid, row._count._all);
    }

    if (jobsByTeam.size === 0) return [];

    const focusRows = await this.prisma.teamFocusArea.findMany({
      where: { teamUid: { in: [...jobsByTeam.keys()] } },
      select: {
        teamUid: true,
        focusAreaUid: true,
        ancestorAreaUid: true,
        focusArea: { select: { title: true } },
        ancestorArea: { select: { title: true } },
      },
    });

    const ancestorSeen = new Set<string>();
    const ancestorCount = new Map<string, number>();
    const leafSeen = new Set<string>();
    const leafCount = new Map<string, { title: string; parentTitle: string; count: number }>();

    for (const row of focusRows) {
      const delta = jobsByTeam.get(row.teamUid) ?? 0;
      const ancestorKey = `${row.teamUid}::${row.ancestorAreaUid}`;
      if (!ancestorSeen.has(ancestorKey)) {
        ancestorSeen.add(ancestorKey);
        ancestorCount.set(row.ancestorArea.title, (ancestorCount.get(row.ancestorArea.title) ?? 0) + delta);
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
      if (leaf.title === leaf.parentTitle) continue;
      if (!childrenByParent.has(leaf.parentTitle)) childrenByParent.set(leaf.parentTitle, []);
      childrenByParent.get(leaf.parentTitle)?.push({ value: leaf.title, count: leaf.count });
    }

    for (const children of childrenByParent.values()) {
      children.sort((a, b) => a.value.localeCompare(b.value));
    }

    return [...ancestorCount.entries()]
      .map(([value, count]) => ({
        value,
        count,
        children: childrenByParent.get(value) ?? [],
      }))
      .sort((a, b) => a.value.localeCompare(b.value));
  }
}
