// Service enforces business rules: single profile per team, status gating for members.
import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import {PrismaService} from "../../shared/prisma.service";


type UpsertDto = {
  focusAreaUid?: string | null;
  fundingStageUid?: string | null;
  onePagerUrl?: string | null;
  videoUrl?: string | null;
};

type Status = 'DISABLED' | 'DRAFT' | 'PUBLISHED';

@Injectable()
export class TeamFundraisingService {
  constructor(private readonly prisma: PrismaService) {}

  // --- helpers ---
  private async ensureTeamExists(teamUid: string) {
    const team = await this.prisma.team.findUnique({ where: { uid: teamUid }, select: { uid: true } });
    if (!team) throw new NotFoundException('Team not found');
  }

  private async isTeamMember(memberUid: string, teamUid: string) {
    const count = await this.prisma.teamMemberRole.count({ where: { memberUid, teamUid } });
    return count > 0;
  }

  // --- member flows ---
  async getForTeamAsMember(teamUid: string, memberUid: string) {
    if (!(await this.isTeamMember(memberUid, teamUid))) throw new ForbiddenException('Not a team member');

    const profile = await this.prisma.teamFundraisingProfile.findUnique({ where: { teamUid } });
    if (!profile) throw new NotFoundException('TeamFundraisingProfile not found');

    if (profile.status === 'DISABLED') {
      // Disabled -> not available to team members
      throw new ForbiddenException('TeamFundraisingProfile is disabled');
    }
    return profile;
  }

  async upsertForTeamAsMember(teamUid: string, memberUid: string, dto: UpsertDto) {
    await this.ensureTeamExists(teamUid);
    if (!(await this.isTeamMember(memberUid, teamUid))) throw new ForbiddenException('Not a team member');

    const existing = await this.prisma.teamFundraisingProfile.findUnique({ where: { teamUid } });
    if (existing && existing.status === 'DISABLED') {
      // Disabled -> not editable by team members
      throw new ForbiddenException('TeamFundraisingProfile is disabled');
    }

    const data = {
      focusAreaUid: dto.focusAreaUid ?? null,
      fundingStageUid: dto.fundingStageUid ?? null,
      onePagerUrl: dto.onePagerUrl ?? null,
      videoUrl: dto.videoUrl ?? null,
      lastModifiedBy: memberUid,
    };

    return this.prisma.teamFundraisingProfile.upsert({
      where: { teamUid },
      create: { teamUid, ...data, status: 'DRAFT' }, // New profiles start as DRAFT
      update: data,
    });
  }

  // --- admin flows ---
  async listAsAdmin(params: { page: number; limit: number; status?: Status; teamUid?: string }) {
    const { page, limit, status, teamUid } = params;
    const where: any = {};
    if (status) where.status = status;
    if (teamUid) where.teamUid = teamUid;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.teamFundraisingProfile.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.teamFundraisingProfile.count({ where }),
    ]);

    return { items, page, limit, total, hasMore: page * limit < total };
  }

  async getByUidAsAdmin(uid: string) {
    const p = await this.prisma.teamFundraisingProfile.findUnique({ where: { uid } });
    if (!p) throw new NotFoundException('TeamFundraisingProfile not found');
    return p;
  }

  async updateByUidAsAdmin(
    uid: string,
    dto: UpsertDto & { status?: Status },
  ) {
    const exists = await this.prisma.teamFundraisingProfile.findUnique({ where: { uid } });
    if (!exists) throw new NotFoundException('TeamFundraisingProfile not found');

    return this.prisma.teamFundraisingProfile.update({
      where: { uid },
      data: {
        focusAreaUid: dto.focusAreaUid ?? undefined,
        fundingStageUid: dto.fundingStageUid ?? undefined,
        onePagerUrl: dto.onePagerUrl ?? undefined,
        videoUrl: dto.videoUrl ?? undefined,
        status: dto.status ?? undefined,
      },
    });
  }

  async changeStatusAsAdmin(uid: string, status: Status) {
    const exists = await this.prisma.teamFundraisingProfile.findUnique({ where: { uid } });
    if (!exists) throw new NotFoundException('TeamFundraisingProfile not found');
    return this.prisma.teamFundraisingProfile.update({ where: { uid }, data: { status } });
  }
}
