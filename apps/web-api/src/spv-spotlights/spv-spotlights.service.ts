import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  accessRequestConflict,
  normalizeEmail,
  resolveViewerAccess,
  ViewerAccess,
  visibleDocSendUrl,
} from './spv-spotlight.utils';

const spotlightInclude = {
  media: {
    orderBy: { sortOrder: 'asc' as const },
    include: { image: { select: { url: true } } },
  },
  team: {
    select: {
      uid: true,
      name: true,
      shortDescription: true,
      longDescription: true,
      website: true,
      location: true,
      teamSize: true,
      logo: { select: { url: true } },
      fundingStage: { select: { title: true } },
      industryTags: { select: { title: true } },
      teamMemberRoles: {
        where: {
          endDate: null,
          OR: [{ teamLead: true }, { role: { contains: 'founder', mode: 'insensitive' as const } }],
        },
        select: {
          role: true,
          member: {
            select: {
              uid: true,
              name: true,
              image: { select: { url: true } },
            },
          },
        },
      },
    },
  },
};

type SpotlightWithTeam = Prisma.SpvSpotlightGetPayload<{ include: typeof spotlightInclude }>;

@Injectable()
export class SpvSpotlightsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBySlug(slug: string, memberEmail: string | null) {
    const spotlight = await this.prisma.spvSpotlight.findUnique({
      where: { slug },
      include: spotlightInclude,
    });
    if (!spotlight) {
      throw new NotFoundException('SPV spotlight not found');
    }

    const email = memberEmail ? normalizeEmail(memberEmail) : null;
    const member = email
      ? await this.prisma.member.findFirst({
          where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
          select: { uid: true },
        })
      : null;

    const [request, preApproved] = member
      ? await Promise.all([
          this.prisma.spvAccessRequest.findUnique({
            where: { spvSpotlightUid_memberUid: { spvSpotlightUid: spotlight.uid, memberUid: member.uid } },
            select: { status: true },
          }),
          this.prisma.spvSpotlightParticipant.findFirst({
            where: { spvSpotlightUid: spotlight.uid, memberUid: member.uid, type: 'INVESTOR', cohort: 'PRE_APPROVED' },
            select: { uid: true },
          }),
        ])
      : [null, null];

    const viewerAccess = resolveViewerAccess({
      hasToken: !!email,
      requestStatus: request?.status ?? null,
      isPreApproved: !!preApproved,
    });

    return this.toPublic(spotlight, viewerAccess);
  }

  async requestAccess(
    slug: string,
    body: { email: string; name: string; role: string; organization: string; isAccreditedInvestor: true },
    actorEmail: string | null
  ) {
    const spotlight = await this.prisma.spvSpotlight.findUnique({ where: { slug } });
    if (!spotlight) {
      throw new NotFoundException('SPV spotlight not found');
    }
    if (spotlight.status === 'CLOSED') {
      throw new HttpException({ message: 'This spotlight is closed' }, HttpStatus.CONFLICT);
    }

    const email = normalizeEmail(actorEmail || body.email);
    let member = await this.prisma.member.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { investorProfile: true },
    });
    const isNewMember = !member;

    if (!member) {
      member = await this.prisma.member.create({
        data: {
          email,
          name: body.name.trim(),
          role: body.role.trim(),
          signUpSource: `spv-${spotlight.slug}`,
          memberApproval: {
            create: { state: 'PENDING', reason: 'SPV Spotlight access request' },
          },
        },
        include: { investorProfile: true },
      });
    } else if (!actorEmail && body.name.trim() && !member.name) {
      member = await this.prisma.member.update({
        where: { uid: member.uid },
        data: { name: body.name.trim(), role: body.role.trim() },
        include: { investorProfile: true },
      });
    } else if (body.role.trim() && member.role !== body.role.trim()) {
      member = await this.prisma.member.update({
        where: { uid: member.uid },
        data: { role: body.role.trim() },
        include: { investorProfile: true },
      });
    }

    await this.ensureAccreditedProfile(
      member.uid,
      member.investorProfile?.uid ?? null,
      member.investorProfile?.secRulesAccepted ?? false
    );
    const teamUid = await this.attachOrganization(member.uid, body.role.trim(), body.organization.trim());

    const [existing, preApproved] = await Promise.all([
      this.prisma.spvAccessRequest.findUnique({
        where: { spvSpotlightUid_memberUid: { spvSpotlightUid: spotlight.uid, memberUid: member.uid } },
        select: { status: true },
      }),
      this.prisma.spvSpotlightParticipant.findFirst({
        where: { spvSpotlightUid: spotlight.uid, memberUid: member.uid, type: 'INVESTOR', cohort: 'PRE_APPROVED' },
        select: { uid: true },
      }),
    ]);

    const conflict = accessRequestConflict({
      requestStatus: existing?.status ?? null,
      isPreApproved: !!preApproved,
    });
    if (conflict) {
      throw new HttpException({ reason: conflict }, HttpStatus.CONFLICT);
    }

    await this.prisma.spvAccessRequest.create({
      data: {
        spvSpotlightUid: spotlight.uid,
        memberUid: member.uid,
        role: body.role.trim(),
        organization: body.organization.trim(),
        teamUid,
        isAccreditedInvestor: true,
        status: 'PENDING',
      },
    });

    return { memberUid: member.uid, isNewMember };
  }

  private async ensureAccreditedProfile(memberUid: string, profileUid: string | null, alreadyAccepted: boolean) {
    if (!profileUid) {
      const profile = await this.prisma.investorProfile.create({
        data: {
          memberUid,
          investmentFocus: [],
          secRulesAccepted: true,
          secRulesAcceptedAt: new Date(),
        },
      });
      await this.prisma.member.update({
        where: { uid: memberUid },
        data: { investorProfileId: profile.uid },
      });
      return;
    }
    if (!alreadyAccepted) {
      await this.prisma.investorProfile.update({
        where: { uid: profileUid },
        data: { secRulesAccepted: true, secRulesAcceptedAt: new Date() },
      });
    }
  }

  private async attachOrganization(memberUid: string, role: string, organization: string): Promise<string> {
    const name = organization.trim();
    let team = await this.prisma.team.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { uid: true },
    });
    if (!team) {
      try {
        team = await this.prisma.team.create({
          data: { name, accessLevel: 'L0' },
          select: { uid: true },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          team = await this.prisma.team.findFirst({
            where: { name: { equals: name, mode: 'insensitive' } },
            select: { uid: true },
          });
        }
        if (!team) {
          throw error;
        }
      }
    }

    if (!team) {
      throw new Error('Team was not created');
    }

    const resolvedTeam = team;
    const roles = await this.prisma.teamMemberRole.findMany({
      where: { memberUid },
      select: { teamUid: true, mainTeam: true },
    });
    const existing = roles.find((row) => row.teamUid === resolvedTeam.uid);
    if (!existing) {
      await this.prisma.teamMemberRole.create({
        data: {
          memberUid,
          teamUid: resolvedTeam.uid,
          role,
          investmentTeam: true,
          mainTeam: !roles.some((row) => row.mainTeam),
        },
      });
    }
    return resolvedTeam.uid;
  }

  private toPublic(spotlight: SpotlightWithTeam, viewerAccess: ViewerAccess) {
    const seen = new Set<string>();
    const founders = spotlight.team.teamMemberRoles
      .filter((row) => {
        if (seen.has(row.member.uid)) {
          return false;
        }
        seen.add(row.member.uid);
        return true;
      })
      .map((row) => ({
        uid: row.member.uid,
        name: row.member.name,
        imageUrl: row.member.image?.url ?? null,
        role: row.role,
      }));

    const showDataRoom = visibleDocSendUrl(spotlight.status, viewerAccess, spotlight.docSendUrl);

    return {
      uid: spotlight.uid,
      slug: spotlight.slug,
      status: spotlight.status,
      title: spotlight.title,
      description: spotlight.description,
      supportEmail: spotlight.supportEmail,
      closesAt: spotlight.closesAt,
      docSendUrl: showDataRoom,
      team: {
        uid: spotlight.team.uid,
        name: spotlight.team.name,
        logoUrl: spotlight.team.logo?.url ?? null,
        shortDescription: spotlight.team.shortDescription ?? '',
        longDescription: spotlight.team.longDescription,
        summary: spotlight.summary,
        website: spotlight.team.website,
        location: spotlight.team.location,
        teamSize: spotlight.team.teamSize,
        fundingStage: spotlight.team.fundingStage?.title ?? null,
        tags: spotlight.team.industryTags.map((tag) => tag.title),
        founders,
      },
      media: spotlight.media.map((item) => ({
        url: item.image.url,
        alt: item.alt,
        fit: item.fit === 'contain' ? 'contain' : 'cover',
      })),
      viewerAccess,
    };
  }
}
