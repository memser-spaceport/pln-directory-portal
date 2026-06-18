import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TeamPitchParticipantAccess, TeamPitchParticipantType, TeamPitchStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { ADMIN_PERMISSIONS, TEAM_PITCH_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { resolveTeamPitchSupportEmail, resolveTeamPitchClosedAt, toKebabSlug } from './team-pitch.utils';

export type TeamPitchAccessLevel = 'restricted' | 'view' | 'edit';

export type ResolvedTeamPitchAccess = {
  access: TeamPitchAccessLevel;
  participantAccess?: TeamPitchParticipantAccess;
  participantType?: TeamPitchParticipantType;
  isPitchAdmin?: boolean;
  confidentialityAccepted?: boolean;
  participantUid?: string;
};

@Injectable()
export class TeamPitchesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPitchBySlugOrUid(slugOrUid: string) {
    return this.prisma.teamPitch.findFirst({
      where: {
        OR: [{ slug: slugOrUid }, { uid: slugOrUid }],
      },
      include: {
        team: {
          select: {
            uid: true,
            name: true,
          },
        },
        headerImage: { select: { uid: true, url: true } },
        logo: { select: { uid: true, url: true } },
        profile: {
          include: {
            onePagerUpload: true,
            videoUpload: true,
          },
        },
      },
    });
  }

  async resolveAccess(memberEmail: string | null, pitchUid: string): Promise<ResolvedTeamPitchAccess> {
    if (!memberEmail) {
      return { access: 'restricted' };
    }

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail.toLowerCase().trim() },
      include: {
        memberApproval: true,
        teamPitchParticipants: {
          where: { teamPitchUid: pitchUid },
          take: 1,
        },
        policyAssignmentsV2: {
          include: {
            policy: {
              include: {
                policyPermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        memberPermissionsV2: {
          include: { permission: true },
        },
      },
    });

    if (!member || member.memberApproval?.state === 'REJECTED') {
      return { access: 'restricted' };
    }

    const permissionCodes = new Set<string>();
    for (const mp of member.memberPermissionsV2) {
      if (mp.permission?.code) permissionCodes.add(mp.permission.code);
    }
    for (const pa of member.policyAssignmentsV2) {
      for (const pp of pa.policy?.policyPermissions ?? []) {
        if (pp.permission?.code) permissionCodes.add(pp.permission.code);
      }
    }

    if (permissionCodes.has(ADMIN_PERMISSIONS.DIRECTORY_FULL) || permissionCodes.has(TEAM_PITCH_PERMISSIONS.ADMIN)) {
      const participant = member.teamPitchParticipants[0];
      return {
        access: 'edit',
        isPitchAdmin: true,
        participantType: participant?.type,
        confidentialityAccepted: participant?.confidentialityAccepted ?? true,
        participantUid: participant?.uid,
      };
    }

    const participant = member.teamPitchParticipants[0];
    if (!participant || participant.access === TeamPitchParticipantAccess.RESTRICTED) {
      return { access: 'restricted' };
    }

    return {
      access: participant.access === TeamPitchParticipantAccess.EDIT ? 'edit' : 'view',
      participantAccess: participant.access,
      participantType: participant.type,
      confidentialityAccepted: participant.confidentialityAccepted,
      participantUid: participant.uid,
    };
  }

  async getAccess(memberEmail: string | null, slugOrUid: string) {
    const pitch = await this.getPitchBySlugOrUid(slugOrUid);
    if (!pitch) {
      throw new NotFoundException('Team pitch not found');
    }

    const resolved = await this.resolveAccess(memberEmail, pitch.uid);

    return {
      uid: pitch.uid,
      slug: pitch.slug,
      createdAt: pitch.createdAt.toISOString(),
      status: pitch.status,
      closedAt: resolveTeamPitchClosedAt(pitch),
      title: pitch.title,
      description: pitch.description,
      supportEmail: pitch.supportEmail,
      logoUrl: pitch.logo?.url ?? null,
      primaryColor: pitch.primaryColor,
      headerImageUrl: pitch.headerImage?.url ?? null,
      teamUid: pitch.team.uid,
      teamName: pitch.team.name,
      access: resolved.access,
      participantAccess: resolved.participantAccess ?? null,
      participantType: resolved.participantType ?? null,
      isPitchAdmin: resolved.isPitchAdmin ?? false,
      confidentialityAccepted: resolved.confidentialityAccepted ?? false,
    };
  }

  async assertEditAccess(memberEmail: string, slugOrUid: string) {
    const pitch = await this.getPitchBySlugOrUid(slugOrUid);
    if (!pitch) {
      throw new NotFoundException('Team pitch not found');
    }
    const resolved = await this.resolveAccess(memberEmail, pitch.uid);
    if (resolved.access !== 'edit') {
      throw new ForbiddenException('Edit access required');
    }
    return { pitch, resolved };
  }

  async assertViewAccess(memberEmail: string, slugOrUid: string) {
    const pitch = await this.getPitchBySlugOrUid(slugOrUid);
    if (!pitch) {
      throw new NotFoundException('Team pitch not found');
    }
    const resolved = await this.resolveAccess(memberEmail, pitch.uid);
    if (resolved.access === 'restricted') {
      throw new ForbiddenException('No team pitch access');
    }
    return { pitch, resolved };
  }

  async listPitches(query: { search?: string; status?: TeamPitchStatus }) {
    const where: Prisma.TeamPitchWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { team: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const pitches = await this.prisma.teamPitch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        team: {
          select: {
            uid: true,
            name: true,
            logo: { select: { uid: true, url: true } },
          },
        },
        logo: { select: { uid: true, url: true } },
      },
    });

    return pitches.map((p) => ({
      uid: p.uid,
      slug: p.slug,
      title: p.title,
      description: p.description,
      status: p.status,
      supportEmail: p.supportEmail,
      primaryColor: p.primaryColor,
      createdAt: p.createdAt.toISOString(),
      team: p.team,
      logoUrl: p.logo?.url ?? p.team.logo?.url ?? null,
    }));
  }

  async createPitch(data: {
    teamUid: string;
    title: string;
    description: string;
    slug?: string;
    status?: TeamPitchStatus;
    supportEmail?: string | null;
    headerImageUid?: string | null;
    logoUid?: string | null;
    primaryColor?: string | null;
  }) {
    const team = await this.prisma.team.findUnique({ where: { uid: data.teamUid } });
    if (!team) {
      throw new BadRequestException('Team not found');
    }

    const baseSlug = data.slug ? toKebabSlug(data.slug) : toKebabSlug(team.name);
    const slug = await this.ensureUniqueSlug(baseSlug);

    const latestFundraising = await this.prisma.teamFundraisingProfile.findFirst({
      where: { teamUid: data.teamUid },
      orderBy: { updatedAt: 'desc' },
    });

    const supportEmail = resolveTeamPitchSupportEmail(data.supportEmail);

    const pitch = await this.prisma.teamPitch.create({
      data: {
        teamUid: data.teamUid,
        slug,
        title: data.title,
        description: data.description,
        status: data.status ?? TeamPitchStatus.DRAFT,
        closedAt: data.status === TeamPitchStatus.CLOSED ? new Date() : undefined,
        supportEmail,
        headerImageUid: data.headerImageUid ?? undefined,
        logoUid: data.logoUid ?? undefined,
        primaryColor: data.primaryColor ?? '#1a45e6',
        profile: {
          create: {
            description: latestFundraising?.description ?? undefined,
            onePagerUploadUid: latestFundraising?.onePagerUploadUid ?? undefined,
            videoUploadUid: latestFundraising?.videoUploadUid ?? undefined,
          },
        },
      },
      include: {
        team: { select: { uid: true, name: true } },
        profile: true,
      },
    });

    return pitch;
  }

  async getPitchDetail(pitchUid: string) {
    const pitch = await this.prisma.teamPitch.findUnique({
      where: { uid: pitchUid },
      include: {
        team: {
          select: {
            uid: true,
            name: true,
            logo: { select: { uid: true, url: true } },
          },
        },
        headerImage: { select: { uid: true, url: true } },
        logo: { select: { uid: true, url: true } },
        profile: true,
      },
    });
    if (!pitch) {
      throw new NotFoundException('Team pitch not found');
    }

    const webBase = process.env.WEB_UI_BASE_URL || '';
    return {
      ...pitch,
      publicUrl: `${webBase}/spotlight/${pitch.slug}`,
      logoUrl: pitch.logo?.url ?? null,
      headerImageUrl: pitch.headerImage?.url ?? null,
    };
  }

  async updatePitch(
    pitchUid: string,
    data: {
      title?: string;
      description?: string;
      slug?: string;
      status?: TeamPitchStatus;
      supportEmail?: string | null;
      headerImageUid?: string | null;
      logoUid?: string | null;
      primaryColor?: string | null;
    }
  ) {
    const existing = await this.prisma.teamPitch.findUnique({ where: { uid: pitchUid } });
    if (!existing) {
      throw new NotFoundException('Team pitch not found');
    }

    let slug = existing.slug;
    if (data.slug && data.slug !== existing.slug) {
      slug = await this.ensureUniqueSlug(toKebabSlug(data.slug), pitchUid);
    }

    const resolvedSupportEmail =
      data.supportEmail !== undefined ? resolveTeamPitchSupportEmail(data.supportEmail) : undefined;

    let closedAt: Date | null | undefined;
    if (data.status !== undefined) {
      if (data.status === TeamPitchStatus.CLOSED && existing.status !== TeamPitchStatus.CLOSED) {
        closedAt = new Date();
      } else if (data.status !== TeamPitchStatus.CLOSED) {
        closedAt = null;
      }
    }

    return this.prisma.teamPitch.update({
      where: { uid: pitchUid },
      data: {
        title: data.title,
        description: data.description,
        slug,
        status: data.status,
        closedAt,
        supportEmail: resolvedSupportEmail,
        headerImageUid: data.headerImageUid,
        logoUid: data.logoUid,
        primaryColor: data.primaryColor ?? '#1a45e6',
      },
      include: {
        team: { select: { uid: true, name: true } },
        headerImage: { select: { uid: true, url: true } },
        logo: { select: { uid: true, url: true } },
        profile: true,
      },
    });
  }

  private async ensureUniqueSlug(base: string, excludePitchUid?: string): Promise<string> {
    if (!base) {
      throw new BadRequestException('Invalid slug');
    }
    let candidate = base;
    let n = 2;
    while (true) {
      const existing = await this.prisma.teamPitch.findFirst({
        where: {
          slug: candidate,
          ...(excludePitchUid ? { NOT: { uid: excludePitchUid } } : {}),
        },
      });
      if (!existing) {
        return candidate;
      }
      candidate = `${base}-${n}`;
      n += 1;
    }
  }

  async updateConfidentiality(memberEmail: string, slugOrUid: string, accepted: boolean) {
    const { pitch, resolved } = await this.assertViewAccess(memberEmail, slugOrUid);
    if (resolved.isPitchAdmin && !resolved.participantUid) {
      return { confidentialityAccepted: true };
    }
    if (!resolved.participantUid) {
      throw new ForbiddenException('No participant record');
    }
    await this.prisma.teamPitchParticipant.update({
      where: { uid: resolved.participantUid },
      data: { confidentialityAccepted: accepted },
    });
    return { confidentialityAccepted: accepted, pitchUid: pitch.uid };
  }
}
