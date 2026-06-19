import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TeamPitchParticipantAccess, TeamPitchParticipantType, UploadKind } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { AwsService } from '../utils/aws/aws.service';
import { TeamEnrichmentService } from '../team-enrichment/team-enrichment.service';
import { TeamPitchesService } from './team-pitches.service';
import { resolveTeamPitchClosedAt } from './team-pitch.utils';

@Injectable()
export class TeamPitchProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamPitchesService: TeamPitchesService,
    private readonly uploadsService: UploadsService,
    private readonly awsService: AwsService,
    private readonly teamEnrichmentService: TeamEnrichmentService
  ) {}

  async getFullPitch(memberEmail: string | null, slugOrUid: string) {
    const pitch = await this.teamPitchesService.getPitchBySlugOrUid(slugOrUid);
    if (!pitch) {
      throw new NotFoundException('Team pitch not found');
    }

    const resolved = await this.teamPitchesService.resolveAccess(memberEmail, pitch.uid);

    if (resolved.access === 'restricted') {
      throw new ForbiddenException('No team pitch access');
    }

    const isInvestor = resolved.participantType === TeamPitchParticipantType.INVESTOR;

    if (pitch.status === 'CLOSED' && isInvestor && !resolved.isPitchAdmin) {
      return {
        uid: pitch.uid,
        slug: pitch.slug,
        status: pitch.status,
        closedAt: resolveTeamPitchClosedAt(pitch),
        title: pitch.title,
        spotlightFrequency: pitch.spotlightFrequency,
        spotlightStatement: pitch.spotlightStatement,
        team: {
          uid: pitch.team.uid,
          name: pitch.team.name,
        },
        teamProfile: null,
      };
    }

    if (pitch.status === 'DRAFT' && isInvestor && !resolved.isPitchAdmin) {
      const canViewDraft =
        resolved.participantAccess === TeamPitchParticipantAccess.VIEW_ADMIN ||
        resolved.participantAccess === TeamPitchParticipantAccess.EDIT;

      if (!canViewDraft) {
        return {
          uid: pitch.uid,
          slug: pitch.slug,
          status: pitch.status,
          title: pitch.title,
          spotlightFrequency: pitch.spotlightFrequency,
          spotlightStatement: pitch.spotlightStatement,
          team: {
            uid: pitch.team.uid,
            name: pitch.team.name,
          },
          teamProfile: null,
        };
      }
    }

    const teamProfile = await this.buildTeamProfileCard(pitch.uid, pitch.teamUid);

    return {
      uid: pitch.uid,
      slug: pitch.slug,
      status: pitch.status,
      title: pitch.title,
      description: pitch.description,
      spotlightFrequency: pitch.spotlightFrequency,
      spotlightStatement: pitch.spotlightStatement,
      supportEmail: pitch.supportEmail,
      primaryColor: pitch.primaryColor,
      logoUrl: pitch.logo?.url ?? null,
      headerImageUrl: pitch.headerImage?.url ?? null,
      createdAt: pitch.createdAt.toISOString(),
      closedAt: resolveTeamPitchClosedAt(pitch),
      access: resolved.access,
      participantType: resolved.participantType ?? null,
      isPitchAdmin: resolved.isPitchAdmin ?? false,
      confidentialityAccepted: resolved.confidentialityAccepted ?? false,
      teamProfile,
    };
  }

  async buildTeamProfileCard(teamPitchUid: string, teamUid: string) {
    const pitch = await this.prisma.teamPitch.findUnique({
      where: { uid: teamPitchUid },
      include: {
        profile: {
          include: {
            onePagerUpload: true,
            videoUpload: true,
          },
        },
      },
    });

    if (!pitch?.profile) {
      throw new NotFoundException('Team pitch profile not found');
    }

    const teamWithDetails = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: {
        uid: true,
        name: true,
        shortDescription: true,
        website: true,
        industryTags: { select: { uid: true, title: true } },
        fundingStage: { select: { uid: true, title: true } },
        logo: { select: { uid: true, url: true } },
      },
    });

    const founders = await this.prisma.teamPitchParticipant.findMany({
      where: {
        teamPitchUid,
        teamUid,
        type: 'FOUNDER',
        access: { not: 'RESTRICTED' },
      },
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
            image: { select: { uid: true, url: true } },
            officeHours: true,
            skills: { select: { uid: true, title: true } },
            teamMemberRoles: {
              where: { teamUid },
              select: { role: true },
            },
          },
        },
      },
    });

    const foundersWithRoles = founders.map((participant) => ({
      uid: participant.member.uid,
      name: participant.member.name,
      email: participant.member.email,
      image: participant.member.image,
      role: participant.member.teamMemberRoles[0]?.role || null,
      skills: participant.member.skills,
      officeHours: participant.member.officeHours,
    }));

    return {
      uid: pitch.profile.uid,
      teamPitchUid: pitch.uid,
      teamUid,
      team: teamWithDetails,
      founders: foundersWithRoles,
      onePagerUploadUid: pitch.profile.onePagerUploadUid,
      onePagerUpload: pitch.profile.onePagerUpload,
      videoUploadUid: pitch.profile.videoUploadUid,
      videoUpload: pitch.profile.videoUpload,
      description: pitch.profile.description,
    };
  }

  async updateProfileDescription(memberEmail: string, slugOrUid: string, description: string | null) {
    const { pitch } = await this.teamPitchesService.assertEditAccess(memberEmail, slugOrUid);
    const member = await this.prisma.member.findUnique({ where: { email: memberEmail } });

    await this.prisma.teamPitchProfile.update({
      where: { teamPitchUid: pitch.uid },
      data: {
        description,
        lastModifiedBy: member?.uid,
      },
    });

    return this.buildTeamProfileCard(pitch.uid, pitch.teamUid);
  }

  async updateTeam(
    memberEmail: string,
    slugOrUid: string,
    data: {
      name?: string;
      shortDescription?: string;
      website?: string | null;
      industryTags?: string[];
      fundingStage?: string;
      logo?: string;
    }
  ) {
    const { pitch } = await this.teamPitchesService.assertEditAccess(memberEmail, slugOrUid);
    const teamUid = pitch.teamUid;

    const updateData: Record<string, unknown> = {};
    const enrichableChanges: Record<string, unknown> = {};

    if (data.name) updateData.name = data.name;
    if (data.shortDescription) {
      updateData.shortDescription = data.shortDescription;
      enrichableChanges.shortDescription = data.shortDescription;
    }
    if (data.website !== undefined) {
      updateData.website = data.website;
      enrichableChanges.website = data.website;
    }
    if (data.logo) {
      updateData.logoUid = data.logo;
      enrichableChanges.logo = data.logo;
    }
    if (data.fundingStage) updateData.fundingStageUid = data.fundingStage;
    if (data.industryTags) {
      updateData.industryTags = { set: data.industryTags.map((uid) => ({ uid })) };
      enrichableChanges.industryTags = data.industryTags;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.team.update({ where: { uid: teamUid }, data: updateData });
      if (Object.keys(enrichableChanges).length > 0) {
        await this.teamEnrichmentService.handleUserFieldChange(teamUid, enrichableChanges, tx);
      }
    });

    return this.buildTeamProfileCard(pitch.uid, teamUid);
  }

  private async getPitchForEdit(memberEmail: string, slugOrUid: string) {
    const { pitch } = await this.teamPitchesService.assertEditAccess(memberEmail, slugOrUid);
    return pitch;
  }

  async updateOnePager(memberEmail: string, slugOrUid: string, onePagerUploadUid: string) {
    const pitch = await this.getPitchForEdit(memberEmail, slugOrUid);
    if (onePagerUploadUid) {
      const upload = await this.prisma.upload.findUnique({ where: { uid: onePagerUploadUid } });
      if (!upload || (upload.kind !== UploadKind.IMAGE && upload.kind !== UploadKind.SLIDE)) {
        throw new BadRequestException('Invalid one-pager upload');
      }
    }
    await this.prisma.teamPitchProfile.update({
      where: { teamPitchUid: pitch.uid },
      data: { onePagerUploadUid: onePagerUploadUid || null },
    });
    return this.buildTeamProfileCard(pitch.uid, pitch.teamUid);
  }

  async deleteOnePager(memberEmail: string, slugOrUid: string) {
    const pitch = await this.getPitchForEdit(memberEmail, slugOrUid);
    await this.prisma.teamPitchProfile.update({
      where: { teamPitchUid: pitch.uid },
      data: { onePagerUploadUid: null },
    });
    return this.buildTeamProfileCard(pitch.uid, pitch.teamUid);
  }

  async updateVideo(memberEmail: string, slugOrUid: string, videoUploadUid: string) {
    const pitch = await this.getPitchForEdit(memberEmail, slugOrUid);
    if (videoUploadUid) {
      const upload = await this.prisma.upload.findUnique({ where: { uid: videoUploadUid } });
      if (!upload || upload.kind !== UploadKind.VIDEO) {
        throw new BadRequestException('Invalid video upload');
      }
    }
    await this.prisma.teamPitchProfile.update({
      where: { teamPitchUid: pitch.uid },
      data: { videoUploadUid: videoUploadUid || null },
    });
    return this.buildTeamProfileCard(pitch.uid, pitch.teamUid);
  }

  async deleteVideo(memberEmail: string, slugOrUid: string) {
    const pitch = await this.getPitchForEdit(memberEmail, slugOrUid);
    await this.prisma.teamPitchProfile.update({
      where: { teamPitchUid: pitch.uid },
      data: { videoUploadUid: null },
    });
    return this.buildTeamProfileCard(pitch.uid, pitch.teamUid);
  }

  async generateVideoUploadUrl(
    memberEmail: string,
    slugOrUid: string,
    filename: string,
    filesize: number,
    mimetype: string
  ) {
    await this.getPitchForEdit(memberEmail, slugOrUid);
    const validVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!validVideoTypes.includes(mimetype)) {
      throw new BadRequestException('Invalid video type');
    }
    if (filesize > 500 * 1024 * 1024) {
      throw new BadRequestException('File too large');
    }
    const fileExt = filename.split('.').pop() || '';
    const hashedFilename = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const s3Key = `uploads/none/none/video/${hashedFilename}.${fileExt}`;
    const bucket = process.env.AWS_S3_UPLOAD_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;
    if (!bucket) throw new BadRequestException('S3 bucket not configured');

    const upload = await this.uploadsService.createPendingUpload({
      kind: UploadKind.VIDEO,
      scopeType: 'NONE',
      scopeUid: null,
      uploaderUid: null,
      filename,
      mimetype,
      size: filesize,
      bucket,
      key: s3Key,
    });

    const presignedUrl = await this.awsService.generatePresignedPutUrl(bucket, s3Key, mimetype, 900);
    return {
      uploadUid: upload.uid,
      presignedUrl,
      s3Key,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  async confirmVideoUpload(memberEmail: string, slugOrUid: string, uploadUid: string) {
    const pitch = await this.getPitchForEdit(memberEmail, slugOrUid);
    const confirmedUpload = await this.uploadsService.confirmUpload(uploadUid);
    await this.prisma.teamPitchProfile.update({
      where: { teamPitchUid: pitch.uid },
      data: { videoUploadUid: confirmedUpload.uid },
    });
    return this.buildTeamProfileCard(pitch.uid, pitch.teamUid);
  }

  async generateOnePagerUploadUrl(
    memberEmail: string,
    slugOrUid: string,
    filename: string,
    filesize: number,
    mimetype: string
  ) {
    await this.getPitchForEdit(memberEmail, slugOrUid);
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(mimetype)) {
      throw new BadRequestException('Invalid one-pager type');
    }
    if (filesize > 25 * 1024 * 1024) {
      throw new BadRequestException('File too large');
    }
    const fileExt = filename.split('.').pop() || '';
    const hashedFilename = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const s3Key = `uploads/none/none/slide/${hashedFilename}.${fileExt}`;
    const bucket = process.env.AWS_S3_UPLOAD_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;
    if (!bucket) throw new BadRequestException('S3 bucket not configured');

    const upload = await this.uploadsService.createPendingUpload({
      kind: UploadKind.SLIDE,
      scopeType: 'NONE',
      scopeUid: null,
      uploaderUid: null,
      filename,
      mimetype,
      size: filesize,
      bucket,
      key: s3Key,
    });

    const presignedUrl = await this.awsService.generatePresignedPutUrl(bucket, s3Key, mimetype, 900);
    return {
      uploadUid: upload.uid,
      presignedUrl,
      s3Key,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
  }

  async confirmOnePagerUpload(memberEmail: string, slugOrUid: string, uploadUid: string) {
    const pitch = await this.getPitchForEdit(memberEmail, slugOrUid);
    const confirmedUpload = await this.uploadsService.confirmUpload(uploadUid);
    await this.prisma.teamPitchProfile.update({
      where: { teamPitchUid: pitch.uid },
      data: { onePagerUploadUid: confirmedUpload.uid },
    });
    return this.buildTeamProfileCard(pitch.uid, pitch.teamUid);
  }

  async uploadOnePagerPreview(
    memberEmail: string,
    slugOrUid: string,
    previewImage: Express.Multer.File,
    previewImageSmall?: Express.Multer.File
  ) {
    const pitch = await this.getPitchForEdit(memberEmail, slugOrUid);
    const profile = await this.prisma.teamPitchProfile.findUnique({
      where: { teamPitchUid: pitch.uid },
      include: { onePagerUpload: true },
    });

    if (!profile?.onePagerUpload) {
      throw new BadRequestException('No one-pager upload found. Please upload a one-pager first.');
    }

    const [previewUpload, previewSmallUpload] = await Promise.all([
      this.uploadsService.uploadGeneric({
        file: previewImage,
        kind: UploadKind.IMAGE,
        scopeType: 'NONE',
      }),
      previewImageSmall
        ? this.uploadsService.uploadGeneric({
            file: previewImageSmall,
            kind: UploadKind.IMAGE,
            scopeType: 'NONE',
          })
        : Promise.resolve(),
    ]);

    await this.prisma.upload.update({
      where: { uid: profile.onePagerUpload.uid },
      data: {
        previewImageUrl: previewUpload.url,
        previewImageSmallUrl: previewSmallUpload?.url,
      },
    });

    return this.buildTeamProfileCard(pitch.uid, pitch.teamUid);
  }
}
