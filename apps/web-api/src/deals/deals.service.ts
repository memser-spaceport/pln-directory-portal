import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DealIssueStatus, DealStatus, DealSubmissionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  ListDealIssuesQueryDto,
  ListDealsQueryDto,
  ListDealSubmissionsQueryDto,
  ReportDealIssueDto,
  SubmitDealDto,
  UpdateDealIssueDto,
  UpdateDealSubmissionDto,
  UpsertDealDto,
} from './deals.dto';

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveMemberByEmail(userEmail: string) {
    if (!userEmail) {
      throw new UnauthorizedException('User email not found');
    }

    const member = await this.prisma.member.findFirst({
      where: { email: userEmail },
      select: {
        uid: true,
        email: true,
        name: true,
        teamMemberRoles: {
          where: { mainTeam: true },
          select: { teamUid: true },
          take: 1,
        },
      },
    });

    if (!member) {
      throw new UnauthorizedException('Member not found');
    }

    return {
      memberUid: member.uid,
      teamUid: member.teamMemberRoles?.[0]?.teamUid ?? null,
    };
  }

  private async ensureDealsAccess(userEmail: string) {
    const resolved = await this.resolveMemberByEmail(userEmail);

    const whitelist = await this.prisma.dealWhitelist.findUnique({
      where: { memberUid: resolved.memberUid },
    });

    if (!whitelist) {
      throw new ForbiddenException('Deals access denied');
    }

    return resolved;
  }

  private buildDealWhere(query: ListDealsQueryDto, status?: DealStatus): Prisma.DealWhereInput {
    return {
      ...(status ? { status } : {}),
      ...(query?.category ? { category: query.category } : {}),
      ...(query?.audience ? { audience: query.audience } : {}),
      ...(query?.search
        ? {
            OR: [
              { vendorName: { contains: query.search, mode: 'insensitive' } },
              { shortDescription: { contains: query.search, mode: 'insensitive' } },
              { fullDescription: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
  }

  private buildSubmissionWhere(query: ListDealSubmissionsQueryDto): Prisma.DealSubmissionWhereInput {
    return {
      ...(query?.status ? { status: query.status } : {}),
      ...(query?.search
        ? {
            OR: [
              { vendorName: { contains: query.search, mode: 'insensitive' } } as Prisma.DealSubmissionWhereInput,
              { shortDescription: { contains: query.search, mode: 'insensitive' } } as Prisma.DealSubmissionWhereInput,
              { fullDescription: { contains: query.search, mode: 'insensitive' } } as Prisma.DealSubmissionWhereInput,
              {
                authorMember: {
                  OR: [
                    { name: { contains: query.search, mode: 'insensitive' } },
                    { email: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              } as Prisma.DealSubmissionWhereInput,
            ],
          }
        : {}),
    };
  }

  private buildIssueWhere(query: ListDealIssuesQueryDto): Prisma.DealIssueWhereInput {
    return {
      ...(query?.status ? { status: query.status } : {}),
      ...(query?.dealUid ? { dealUid: query.dealUid } : {}),
      ...(query?.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } } as Prisma.DealIssueWhereInput,
              {
                deal: {
                  OR: [
                    { vendorName: { contains: query.search, mode: 'insensitive' } },
                    { shortDescription: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              } as Prisma.DealIssueWhereInput,
              {
                authorMember: {
                  OR: [
                    { name: { contains: query.search, mode: 'insensitive' } },
                    { email: { contains: query.search, mode: 'insensitive' } },
                  ],
                },
              } as Prisma.DealIssueWhereInput,
            ],
          }
        : {}),
    };
  }

  private countUniqueTeamsOrMembers(
    rows: Array<{ dealUid: string; teamUid: string | null; memberUid: string }>,
  ): Map<string, number> {
    const uniqueMap = new Map<string, Set<string>>();

    for (const row of rows) {
      const uniqueKey = row.teamUid ?? `member:${row.memberUid}`;

      if (!uniqueMap.has(row.dealUid)) {
        uniqueMap.set(row.dealUid, new Set());
      }

      uniqueMap.get(row.dealUid)!.add(uniqueKey);
    }

    const countMap = new Map<string, number>();
    for (const [dealUid, set] of uniqueMap.entries()) {
      countMap.set(dealUid, set.size);
    }

    return countMap;
  }

  async canAccessDeals(userEmail: string) {
    const { memberUid } = await this.resolveMemberByEmail(userEmail);

    const whitelist = await this.prisma.dealWhitelist.findUnique({
      where: { memberUid },
    });

    return !!whitelist;
  }

  async listForUser(userEmail: string, query: ListDealsQueryDto) {
    const { memberUid } = await this.ensureDealsAccess(userEmail);

    const deals = await this.prisma.deal.findMany({
      where: this.buildDealWhere(query, DealStatus.ACTIVE),
      orderBy: { createdAt: 'desc' },
      include: { logo: { select: { url: true } } },
    });

    if (!deals.length) {
      return [];
    }

    const dealUids = deals.map((d) => d.uid);

    const [redemptions, usages, allRedemptions, allUsages] = await Promise.all([
      this.prisma.dealRedemption.findMany({
        where: {
          memberUid,
          dealUid: { in: dealUids },
        },
        select: { dealUid: true },
      }),
      this.prisma.dealUsage.findMany({
        where: {
          memberUid,
          dealUid: { in: dealUids },
        },
        select: { dealUid: true },
      }),
      this.prisma.dealRedemption.findMany({
        where: {
          dealUid: { in: dealUids },
        },
        select: {
          dealUid: true,
          teamUid: true,
          memberUid: true,
        },
      }),
      this.prisma.dealUsage.findMany({
        where: {
          dealUid: { in: dealUids },
        },
        select: {
          dealUid: true,
          teamUid: true,
          memberUid: true,
        },
      }),
    ]);

    const redeemedSet = new Set(redemptions.map((r) => r.dealUid));
    const usingSet = new Set(usages.map((u) => u.dealUid));

    const redemptionCountMap = this.countUniqueTeamsOrMembers(allRedemptions);
    const usageCountMap = this.countUniqueTeamsOrMembers(allUsages);

    return deals.map(({ logo, ...deal }) => ({
      ...deal,
      logoUrl: logo?.url ?? null,
      isRedeemed: redeemedSet.has(deal.uid),
      isUsing: usingSet.has(deal.uid),
      teamsRedemptionCount: redemptionCountMap.get(deal.uid) ?? 0,
      teamsUsingCount: usageCountMap.get(deal.uid) ?? 0,
    }));
  }

  async getForUser(userEmail: string, uid: string) {
    const { memberUid } = await this.ensureDealsAccess(userEmail);

    const deal = await this.prisma.deal.findFirst({
      where: {
        uid,
        status: DealStatus.ACTIVE,
      },
      include: { logo: { select: { url: true } } },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const [redemption, usage, allRedemptions, allUsages] = await Promise.all([
      this.prisma.dealRedemption.findUnique({
        where: {
          dealUid_memberUid: {
            dealUid: uid,
            memberUid,
          },
        },
      }),
      this.prisma.dealUsage.findUnique({
        where: {
          dealUid_memberUid: {
            dealUid: uid,
            memberUid,
          },
        },
      }),
      this.prisma.dealRedemption.findMany({
        where: { dealUid: uid },
        select: {
          dealUid: true,
          teamUid: true,
          memberUid: true,
        },
      }),
      this.prisma.dealUsage.findMany({
        where: { dealUid: uid },
        select: {
          dealUid: true,
          teamUid: true,
          memberUid: true,
        },
      }),
    ]);

    const redemptionCountMap = this.countUniqueTeamsOrMembers(allRedemptions);
    const usageCountMap = this.countUniqueTeamsOrMembers(allUsages);
    const { logo, ...rest } = deal;

    return {
      ...rest,
      logoUrl: logo?.url ?? null,
      isRedeemed: !!redemption,
      isUsing: !!usage,
      teamsRedemptionCount: redemptionCountMap.get(uid) ?? 0,
      teamsUsingCount: usageCountMap.get(uid) ?? 0,
    };
  }

  async redeem(userEmail: string, uid: string) {
    const { memberUid, teamUid } = await this.ensureDealsAccess(userEmail);

    const deal = await this.prisma.deal.findFirst({
      where: { uid, status: DealStatus.ACTIVE },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return this.prisma.dealRedemption.upsert({
      where: {
        dealUid_memberUid: {
          dealUid: uid,
          memberUid,
        },
      },
      update: {},
      create: {
        dealUid: uid,
        memberUid,
        teamUid,
      },
    });
  }

  async markUsing(userEmail: string, uid: string) {
    const { memberUid, teamUid } = await this.ensureDealsAccess(userEmail);

    const deal = await this.prisma.deal.findFirst({
      where: { uid, status: DealStatus.ACTIVE },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return this.prisma.dealUsage.upsert({
      where: {
        dealUid_memberUid: {
          dealUid: uid,
          memberUid,
        },
      },
      update: {},
      create: {
        dealUid: uid,
        memberUid,
        teamUid,
      },
    });
  }

  async unmarkUsing(userEmail: string, uid: string) {
    const { memberUid } = await this.ensureDealsAccess(userEmail);

    await this.prisma.dealUsage.deleteMany({
      where: {
        dealUid: uid,
        memberUid,
      },
    });

    return { success: true };
  }

  async submitDeal(userEmail: string, body: SubmitDealDto) {
    const { memberUid, teamUid } = await this.ensureDealsAccess(userEmail);

    return this.prisma.dealSubmission.create({
      data: {
        ...(body.vendorName !== undefined ? { vendorName: body.vendorName } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.audience !== undefined ? { audience: body.audience } : {}),
        shortDescription: body.shortDescription,
        fullDescription: body.fullDescription,
        redemptionInstructions: body.redemptionInstructions,
        status: DealSubmissionStatus.OPEN,

        authorMember: {
          connect: { uid: memberUid },
        },

        ...(teamUid
          ? {
              authorTeam: {
                connect: { uid: teamUid },
              },
            }
          : {}),

        ...(body.vendorTeamUid
          ? {
              vendorTeam: {
                connect: { uid: body.vendorTeamUid },
              },
            }
          : {}),

        ...(body.logoUid
          ? {
              logo: {
                connect: { uid: body.logoUid },
              },
            }
          : {}),
      },
      include: {
        logo: { select: { url: true } },
        authorMember: { select: { uid: true, name: true, email: true } },
        authorTeam: { select: { uid: true, name: true } },
      },
    });
  }

  async reportIssue(userEmail: string, dealUid: string, body: ReportDealIssueDto) {
    const { memberUid, teamUid } = await this.ensureDealsAccess(userEmail);

    const deal = await this.prisma.deal.findFirst({
      where: { uid: dealUid, status: DealStatus.ACTIVE },
      select: { uid: true },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return this.prisma.dealIssue.create({
      data: {
        dealUid,
        authorMemberUid: memberUid,
        authorTeamUid: teamUid,
        description: body.description,
        status: DealIssueStatus.OPEN,
      },
      include: {
        deal: { select: { uid: true, vendorName: true, category: true, audience: true } },
        authorMember: { select: { uid: true, name: true, email: true } },
        authorTeam: { select: { uid: true, name: true } },
      },
    });
  }

  private async getDealMetrics(dealUids: string[]) {
    if (!dealUids.length) {
      return new Map<
        string,
        {
          tappedHowToRedeemCount: number;
          markedAsUsingCount: number;
          submittedIssuesCount: number;
        }
      >();
    }

    const [allRedemptions, allUsages, allIssues] = await Promise.all([
      this.prisma.dealRedemption.findMany({
        where: { dealUid: { in: dealUids } },
        select: {
          dealUid: true,
          teamUid: true,
          memberUid: true,
        },
      }),
      this.prisma.dealUsage.findMany({
        where: { dealUid: { in: dealUids } },
        select: {
          dealUid: true,
          teamUid: true,
          memberUid: true,
        },
      }),
      this.prisma.dealIssue.groupBy({
        by: ['dealUid'],
        where: { dealUid: { in: dealUids } },
        _count: { dealUid: true },
      }),
    ]);

    const redemptionCountMap = this.countUniqueTeamsOrMembers(allRedemptions);
    const usageCountMap = this.countUniqueTeamsOrMembers(allUsages);
    const issueCountMap = new Map<string, number>(
      allIssues.map((item) => [item.dealUid, item._count.dealUid]),
    );

    const metrics = new Map<
      string,
      {
        tappedHowToRedeemCount: number;
        markedAsUsingCount: number;
        submittedIssuesCount: number;
      }
    >();

    for (const dealUid of dealUids) {
      metrics.set(dealUid, {
        tappedHowToRedeemCount: redemptionCountMap.get(dealUid) ?? 0,
        markedAsUsingCount: usageCountMap.get(dealUid) ?? 0,
        submittedIssuesCount: issueCountMap.get(dealUid) ?? 0,
      });
    }

    return metrics;
  }

  async adminList(query: ListDealsQueryDto) {
    const deals = await this.prisma.deal.findMany({
      where: this.buildDealWhere(query),
      orderBy: { createdAt: 'desc' },
      include: { logo: { select: { url: true } } },
    });

    const metrics = await this.getDealMetrics(deals.map((deal) => deal.uid));

    return deals.map(({ logo, ...deal }) => ({
      ...deal,
      logoUrl: logo?.url ?? null,
      tappedHowToRedeemCount: metrics.get(deal.uid)?.tappedHowToRedeemCount ?? 0,
      markedAsUsingCount: metrics.get(deal.uid)?.markedAsUsingCount ?? 0,
      submittedIssuesCount: metrics.get(deal.uid)?.submittedIssuesCount ?? 0,
    }));
  }

  async getWhitelist() {
    return this.prisma.dealWhitelist.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async addToWhitelist(memberUid: string) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: {
        uid: true,
        name: true,
        email: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return this.prisma.dealWhitelist.upsert({
      where: { memberUid },
      update: {},
      create: { memberUid },
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async removeFromWhitelist(memberUid: string) {
    await this.prisma.dealWhitelist.deleteMany({
      where: { memberUid },
    });

    return { success: true };
  }

  async adminGetByUid(uid: string) {
    const deal = await this.prisma.deal.findUnique({
      where: { uid },
      include: { logo: { select: { url: true } } },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const metrics = await this.getDealMetrics([uid]);
    const { logo, ...rest } = deal;

    return {
      ...rest,
      logoUrl: logo?.url ?? null,
      tappedHowToRedeemCount: metrics.get(uid)?.tappedHowToRedeemCount ?? 0,
      markedAsUsingCount: metrics.get(uid)?.markedAsUsingCount ?? 0,
      submittedIssuesCount: metrics.get(uid)?.submittedIssuesCount ?? 0,
    };
  }

  async adminCreate(body: UpsertDealDto) {
    const deal = await this.prisma.deal.create({
      data: {
        vendorName: body.vendorName ?? '',
        vendorTeamUid: body.vendorTeamUid ?? null,
        logoUid: body.logoUid ?? null,
        category: body.category ?? '',
        audience: body.audience ?? '',
        shortDescription: body.shortDescription,
        fullDescription: body.fullDescription,
        redemptionInstructions: body.redemptionInstructions,
        contact: body.contact,
        status: body.status ?? DealStatus.DRAFT,
      },
      include: { logo: { select: { url: true } } },
    });

    const { logo, ...rest } = deal;
    return { ...rest, logoUrl: logo?.url ?? null };
  }

  async adminUpdate(uid: string, body: UpsertDealDto) {
    const existing = await this.prisma.deal.findUnique({
      where: { uid },
    });

    if (!existing) {
      throw new NotFoundException('Deal not found');
    }

    const deal = await this.prisma.deal.update({
      where: { uid },
      data: {
        ...(body.vendorName !== undefined ? { vendorName: body.vendorName } : {}),
        ...(body.vendorTeamUid !== undefined ? { vendorTeamUid: body.vendorTeamUid } : {}),
        ...(body.logoUid !== undefined ? { logoUid: body.logoUid } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.audience !== undefined ? { audience: body.audience } : {}),
        ...(body.shortDescription !== undefined ? { shortDescription: body.shortDescription } : {}),
        ...(body.fullDescription !== undefined ? { fullDescription: body.fullDescription } : {}),
        ...(body.redemptionInstructions !== undefined
          ? { redemptionInstructions: body.redemptionInstructions }
          : {}),
        ...(body.contact !== undefined ? { contact: body.contact } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
      include: { logo: { select: { url: true } } },
    });

    const { logo, ...rest } = deal;
    return { ...rest, logoUrl: logo?.url ?? null };
  }

  async adminListSubmissions(query: ListDealSubmissionsQueryDto) {
    return this.prisma.dealSubmission.findMany({
      where: this.buildSubmissionWhere(query),
      orderBy: { createdAt: 'desc' },
      include: {
        logo: { select: { url: true } },
        vendorTeam: { select: { uid: true, name: true } },
        authorMember: { select: { uid: true, name: true, email: true } },
        authorTeam: { select: { uid: true, name: true } },
        reviewedByMember: { select: { uid: true, name: true, email: true } },
      },
    });
  }

  async adminGetSubmission(uid: string) {
    const submission = await this.prisma.dealSubmission.findUnique({
      where: { uid },
      include: {
        logo: { select: { url: true } },
        vendorTeam: { select: { uid: true, name: true } },
        authorMember: { select: { uid: true, name: true, email: true } },
        authorTeam: { select: { uid: true, name: true } },
        reviewedByMember: { select: { uid: true, name: true, email: true } },
      },
    });

    if (!submission) {
      throw new NotFoundException('Deal submission not found');
    }

    return submission;
  }

  async adminUpdateSubmission(uid: string, body: UpdateDealSubmissionDto) {
    const existing = await this.prisma.dealSubmission.findUnique({
      where: { uid },
      select: { uid: true },
    });

    if (!existing) {
      throw new NotFoundException('Deal submission not found');
    }

    return this.prisma.dealSubmission.update({
      where: { uid },
      data: {
        status: body.status,
        reviewedAt: body.status === DealSubmissionStatus.OPEN ? null : new Date(),
      },
      include: {
        logo: { select: { url: true } },
        vendorTeam: { select: { uid: true, name: true } },
        authorMember: { select: { uid: true, name: true, email: true } },
        authorTeam: { select: { uid: true, name: true } },
        reviewedByMember: { select: { uid: true, name: true, email: true } },
      },
    });
  }

  async adminListIssues(query: ListDealIssuesQueryDto) {
    return this.prisma.dealIssue.findMany({
      where: this.buildIssueWhere(query),
      orderBy: { createdAt: 'desc' },
      include: {
        deal: {
          select: {
            uid: true,
            vendorName: true,
            category: true,
            audience: true,
            status: true,
          },
        },
        authorMember: { select: { uid: true, name: true, email: true } },
        authorTeam: { select: { uid: true, name: true } },
        resolvedByMember: { select: { uid: true, name: true, email: true } },
      },
    });
  }

  async adminGetIssue(uid: string) {
    const issue = await this.prisma.dealIssue.findUnique({
      where: { uid },
      include: {
        deal: {
          select: {
            uid: true,
            vendorName: true,
            category: true,
            audience: true,
            status: true,
          },
        },
        authorMember: { select: { uid: true, name: true, email: true } },
        authorTeam: { select: { uid: true, name: true } },
        resolvedByMember: { select: { uid: true, name: true, email: true } },
      },
    });

    if (!issue) {
      throw new NotFoundException('Deal issue not found');
    }

    return issue;
  }

  async adminUpdateIssue(uid: string, body: UpdateDealIssueDto, memberUid?: string) {
    const existing = await this.prisma.dealIssue.findUnique({
      where: { uid },
    });

    if (!existing) {
      throw new NotFoundException('Deal issue not found');
    }

    const data: any = {
      status: body.status,
    };

    if (body.status === 'RESOLVED') {
      data.resolvedAt = new Date();
      data.resolvedByMemberUid = memberUid ?? null;
    }

    if (body.status === 'OPEN') {
      data.resolvedAt = null;
      data.resolvedByMemberUid = null;
    }

    return this.prisma.dealIssue.update({
      where: { uid },
      data,
      include: {
        deal: {
          select: {
            uid: true,
            vendorName: true,
            category: true,
            audience: true,
            status: true,
          },
        },
        authorMember: {
          select: {
            uid: true,
            name: true,
            email: true,
          },
        },
        authorTeam: {
          select: {
            uid: true,
            name: true,
          },
        },
        resolvedByMember: {
          select: {
            uid: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }
}
