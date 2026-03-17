import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DealStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { ListDealsQueryDto, UpsertDealDto } from './deals.dto';

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

    return deals.map((deal) => ({
      ...deal,
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

    return {
      ...deal,
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

  async adminList(query: ListDealsQueryDto) {
    return this.prisma.deal.findMany({
      where: this.buildDealWhere(query),
      orderBy: { createdAt: 'desc' },
    });
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
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    return deal;
  }

  async adminCreate(body: UpsertDealDto) {
    return this.prisma.deal.create({
      data: {
        vendorName: body.vendorName,
        vendorTeamUid: body.vendorTeamUid ?? null,
        logoUid: body.logoUid ?? null,
        category: body.category,
        shortDescription: body.shortDescription,
        fullDescription: body.fullDescription,
        redemptionInstructions: body.redemptionInstructions,
        status: body.status ?? DealStatus.DRAFT,
      },
    });
  }

  async adminUpdate(uid: string, body: UpsertDealDto) {
    const existing = await this.prisma.deal.findUnique({
      where: { uid },
    });

    if (!existing) {
      throw new NotFoundException('Deal not found');
    }

    return this.prisma.deal.update({
      where: { uid },
      data: {
        ...(body.vendorName !== undefined ? { vendorName: body.vendorName } : {}),
        ...(body.vendorTeamUid !== undefined ? { vendorTeamUid: body.vendorTeamUid } : {}),
        ...(body.logoUid !== undefined ? { logoUid: body.logoUid } : {}),
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.shortDescription !== undefined ? { shortDescription: body.shortDescription } : {}),
        ...(body.fullDescription !== undefined ? { fullDescription: body.fullDescription } : {}),
        ...(body.redemptionInstructions !== undefined
          ? { redemptionInstructions: body.redemptionInstructions }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
      },
    });
  }
}
