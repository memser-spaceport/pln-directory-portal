// Service enforces business rules: single profile per team, member gating, and upload validation.
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { UploadKind } from '@prisma/client';

type UpsertDto = {
  focusAreaUid?: string | null;
  fundingStageUid?: string | null;
  onePagerUploadUid?: string | null;
  videoUploadUid?: string | null;
};

type Status = 'DISABLED' | 'DRAFT' | 'PUBLISHED';

@Injectable()
export class TeamFundraisingService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- helpers ----------
  private async ensureTeamExists(teamUid: string) {
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: { uid: true },
    });
    if (!team) throw new NotFoundException('Team not found');
  }

  private async isTeamMember(memberUid: string, teamUid: string) {
    const count = await this.prisma.teamMemberRole.count({ where: { memberUid, teamUid } });
    return count > 0;
  }

  private async validateUploadOwnershipAndKind(
    uploadUid: string,
    teamUid: string,
    allowedKinds: UploadKind[],
    fieldName: string,
  ) {
    const up = await this.prisma.upload.findUnique({ where: { uid: uploadUid } });
    if (!up) throw new BadRequestException(`Upload not found: ${fieldName}`);
    if (!allowedKinds.includes(up.kind)) {
      throw new BadRequestException(
        `${fieldName} must be one of: ${allowedKinds.join(', ')}, got ${up.kind}`,
      );
    }
    if (up.scopeType !== 'TEAM' || up.scopeUid !== teamUid) {
      throw new BadRequestException(`${fieldName} must belong to team scope ${teamUid}`);
    }
  }

  // ---------- member flows ----------
  async getForTeamAsMember(teamUid: string, memberUid: string) {
    if (!(await this.isTeamMember(memberUid, teamUid))) {
      throw new ForbiddenException('Not a team member');
    }

    // JOIN uploads so clients get full Upload rows in one call
    const profile = await this.prisma.teamFundraisingProfile.findUnique({
      where: { teamUid },
      include: {
        onePagerUpload: true,
        videoUpload: true,
      },
    });

    if (!profile) throw new NotFoundException('TeamFundraisingProfile not found');
    if (profile.status === 'DISABLED') {
      // Disabled -> not available to team members
      throw new ForbiddenException('TeamFundraisingProfile is disabled');
    }
    return profile;
  }

  async upsertForTeamAsMember(teamUid: string, memberUid: string, dto: UpsertDto) {
    await this.ensureTeamExists(teamUid);
    if (!(await this.isTeamMember(memberUid, teamUid))) {
      throw new ForbiddenException('Not a team member');
    }

    const existing = await this.prisma.teamFundraisingProfile.findUnique({ where: { teamUid } });
    if (existing && existing.status === 'DISABLED') {
      // Disabled -> not editable by team members
      throw new ForbiddenException('TeamFundraisingProfile is disabled');
    }

    // Validate provided Upload UIDs (if present)
    if (dto.onePagerUploadUid) {
      await this.validateUploadOwnershipAndKind(
        dto.onePagerUploadUid,
        teamUid,
        [UploadKind.SLIDE, UploadKind.IMAGE, UploadKind.OTHER],
        'onePagerUploadUid',
      );
    }
    if (dto.videoUploadUid) {
      await this.validateUploadOwnershipAndKind(
        dto.videoUploadUid,
        teamUid,
        [UploadKind.VIDEO],
        'videoUploadUid',
      );
    }

    const data = {
      focusAreaUid: dto.focusAreaUid ?? null,
      fundingStageUid: dto.fundingStageUid ?? null,
      onePagerUploadUid: dto.onePagerUploadUid ?? null,
      videoUploadUid: dto.videoUploadUid ?? null,
      lastModifiedBy: memberUid,
    };

    // Upsert and return with joined uploads
    return this.prisma.teamFundraisingProfile.upsert({
      where: { teamUid },
      create: { teamUid, ...data, status: 'DRAFT' }, // New profiles start as DRAFT
      update: data,
      include: {
        onePagerUpload: true,
        videoUpload: true,
      },
    });
  }

  // ---------- admin flows (optional) ----------
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
        include: { onePagerUpload: true, videoUpload: true },
      }),
      this.prisma.teamFundraisingProfile.count({ where }),
    ]);

    return { items, page, limit, total, hasMore: page * limit < total };
  }

  async getByUidAsAdmin(uid: string) {
    const p = await this.prisma.teamFundraisingProfile.findUnique({
      where: { uid },
      include: { onePagerUpload: true, videoUpload: true },
    });
    if (!p) throw new NotFoundException('TeamFundraisingProfile not found');
    return p;
  }

  async updateByUidAsAdmin(uid: string, dto: UpsertDto & { status?: Status }) {
    const exists = await this.prisma.teamFundraisingProfile.findUnique({ where: { uid } });
    if (!exists) throw new NotFoundException('TeamFundraisingProfile not found');

    // Validate uploads if provided by admin
    if (dto.onePagerUploadUid) {
      await this.validateUploadOwnershipAndKind(
        dto.onePagerUploadUid,
        exists.teamUid,
        [UploadKind.SLIDE, UploadKind.IMAGE, UploadKind.OTHER],
        'onePagerUploadUid',
      );
    }
    if (dto.videoUploadUid) {
      await this.validateUploadOwnershipAndKind(
        dto.videoUploadUid,
        exists.teamUid,
        [UploadKind.VIDEO],
        'videoUploadUid',
      );
    }

    return this.prisma.teamFundraisingProfile.update({
      where: { uid },
      data: {
        focusAreaUid: dto.focusAreaUid ?? undefined,
        fundingStageUid: dto.fundingStageUid ?? undefined,
        onePagerUploadUid: dto.onePagerUploadUid ?? undefined,
        videoUploadUid: dto.videoUploadUid ?? undefined,
        status: dto.status ?? undefined,
      },
      include: { onePagerUpload: true, videoUpload: true },
    });
  }

  async changeStatusAsAdmin(uid: string, status: Status) {
    const exists = await this.prisma.teamFundraisingProfile.findUnique({ where: { uid } });
    if (!exists) throw new NotFoundException('TeamFundraisingProfile not found');
    return this.prisma.teamFundraisingProfile.update({
      where: { uid },
      data: { status },
      include: { onePagerUpload: true, videoUpload: true },
    });
  }
}
