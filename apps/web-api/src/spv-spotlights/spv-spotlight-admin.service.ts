import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MemberApprovalState,
  Prisma,
  SpvInvestorCohort,
  TeamPitchParticipantAccess,
  TeamPitchParticipantType,
  TeamPitchStatus,
} from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { upsertPolicyAssignmentByCode } from '../demo-days/demo-day-investor-policy.util';
import {
  asStringRecord,
  defaultAccessForParticipantType,
  normalizeOptionalTrimmed,
  resolveTeamPitchSupportEmail,
  toKebabSlug,
} from '../team-pitches/team-pitch.utils';
import {
  asEmailTemplates,
  EmailTemplateKey,
  normalizeEmail,
  openNoticeCounts,
  replaceNbsp,
  sanitizeEmailHtml,
} from './spv-spotlight.utils';
import { SpvSpotlightMailer } from './spv-spotlight-mailer';

type MediaInput = { imageUid: string; alt: string; fit?: 'cover' | 'contain' };

@Injectable()
export class SpvSpotlightAdminService {
  constructor(private readonly prisma: PrismaService, private readonly mailer: SpvSpotlightMailer) {}

  async list(query: { search?: string; status?: TeamPitchStatus }) {
    return this.prisma.spvSpotlight.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { team: { name: { contains: query.search, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { team: { select: { uid: true, name: true, logo: { select: { url: true } } } } },
    });
  }

  async getDetail(uid: string) {
    const spotlight = await this.prisma.spvSpotlight.findUnique({
      where: { uid },
      include: {
        team: { select: { uid: true, name: true } },
        media: { orderBy: { sortOrder: 'asc' }, include: { image: { select: { uid: true, url: true } } } },
      },
    });
    if (!spotlight) {
      throw new NotFoundException('SPV spotlight not found');
    }
    return {
      ...spotlight,
      emailTemplates: asEmailTemplates(spotlight.emailTemplates, spotlight.title),
    };
  }

  async create(input: {
    teamUid: string;
    title: string;
    description: string;
    slug?: string;
    status?: TeamPitchStatus;
    supportEmail?: string | null;
    senderEmail?: string | null;
    senderName?: string | null;
    replyToEmail?: string | null;
    docSendUrl?: string | null;
    summary?: string | null;
    media?: MediaInput[];
  }) {
    const team = await this.prisma.team.findUnique({
      where: { uid: input.teamUid },
      select: { uid: true, name: true },
    });
    if (!team) {
      throw new BadRequestException('Team not found');
    }
    const existing = await this.prisma.spvSpotlight.findUnique({ where: { teamUid: team.uid }, select: { uid: true } });
    if (existing) {
      throw new ConflictException('This team already has an SPV spotlight');
    }
    const slug = await this.uniqueSlug(input.slug?.trim() || toKebabSlug(input.title));
    const title = input.title.trim();
    const spotlight = await this.prisma.spvSpotlight.create({
      data: {
        teamUid: team.uid,
        slug,
        title,
        description: replaceNbsp(input.description),
        status: input.status ?? 'DRAFT',
        supportEmail: resolveTeamPitchSupportEmail(input.supportEmail),
        senderEmail: normalizeOptionalTrimmed(input.senderEmail) ?? null,
        senderName: normalizeOptionalTrimmed(input.senderName) ?? null,
        replyToEmail: normalizeOptionalTrimmed(input.replyToEmail) ?? null,
        docSendUrl: normalizeOptionalTrimmed(input.docSendUrl) ?? null,
        summary: normalizeOptionalTrimmed(input.summary && replaceNbsp(input.summary)) ?? null,
        emailTemplates: asEmailTemplates(null, title),
      },
    });
    if (input.media?.length) {
      await this.replaceMedia(spotlight.uid, input.media);
    }
    await this.addTeamLeads(spotlight.uid, team.uid);
    return this.getDetail(spotlight.uid);
  }

  async update(
    uid: string,
    input: {
      title?: string;
      description?: string;
      slug?: string;
      status?: TeamPitchStatus;
      supportEmail?: string | null;
      senderEmail?: string | null;
      senderName?: string | null;
      replyToEmail?: string | null;
      docSendUrl?: string | null;
      summary?: string | null;
      media?: MediaInput[];
    }
  ) {
    const current = await this.prisma.spvSpotlight.findUnique({ where: { uid } });
    if (!current) {
      throw new NotFoundException('SPV spotlight not found');
    }
    let slug = input.slug?.trim();
    if (slug && slug !== current.slug) {
      const taken = await this.prisma.spvSpotlight.findUnique({ where: { slug }, select: { uid: true } });
      if (taken) {
        throw new ConflictException('Slug is already in use');
      }
    } else {
      slug = undefined;
    }
    await this.prisma.spvSpotlight.update({
      where: { uid },
      data: {
        ...(input.title !== undefined ? { title: input.title.trim() } : {}),
        ...(input.description !== undefined ? { description: replaceNbsp(input.description) } : {}),
        ...(slug ? { slug } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.supportEmail !== undefined ? { supportEmail: resolveTeamPitchSupportEmail(input.supportEmail) } : {}),
        ...(input.senderEmail !== undefined
          ? { senderEmail: normalizeOptionalTrimmed(input.senderEmail) ?? null }
          : {}),
        ...(input.senderName !== undefined ? { senderName: normalizeOptionalTrimmed(input.senderName) ?? null } : {}),
        ...(input.replyToEmail !== undefined
          ? { replyToEmail: normalizeOptionalTrimmed(input.replyToEmail) ?? null }
          : {}),
        ...(input.docSendUrl !== undefined ? { docSendUrl: normalizeOptionalTrimmed(input.docSendUrl) ?? null } : {}),
        ...(input.summary !== undefined
          ? { summary: normalizeOptionalTrimmed(input.summary && replaceNbsp(input.summary)) ?? null }
          : {}),
      },
    });
    if (input.media) {
      await this.replaceMedia(uid, input.media);
    }
    return this.getDetail(uid);
  }

  async updateTemplates(uid: string, templates: Partial<Record<EmailTemplateKey, { subject: string; body: string }>>) {
    const spotlight = await this.prisma.spvSpotlight.findUnique({ where: { uid } });
    if (!spotlight) {
      throw new NotFoundException('SPV spotlight not found');
    }
    const current = asEmailTemplates(spotlight.emailTemplates, spotlight.title);
    for (const [key, value] of Object.entries(templates) as [EmailTemplateKey, { subject: string; body: string }][]) {
      if (!value) {
        continue;
      }
      current[key] = {
        subject: value.subject.trim(),
        body: sanitizeEmailHtml(value.body),
      };
    }
    await this.prisma.spvSpotlight.update({
      where: { uid },
      data: { emailTemplates: current },
    });
    return { templates: current };
  }

  async listParticipants(uid: string, type?: TeamPitchParticipantType) {
    await this.requireSpotlight(uid);
    const [participants, requests] = await Promise.all([
      this.prisma.spvSpotlightParticipant.findMany({
        where: { spvSpotlightUid: uid, ...(type ? { type } : {}) },
        orderBy: { createdAt: 'asc' },
        include: { member: { select: { uid: true, name: true, email: true } } },
      }),
      this.prisma.spvAccessRequest.findMany({
        where: { spvSpotlightUid: uid },
        select: { memberUid: true, status: true },
      }),
    ]);
    const statusByMember = new Map(requests.map((request) => [request.memberUid, request.status]));
    return participants.map((participant) => ({
      ...participant,
      accessRequestStatus: statusByMember.get(participant.memberUid) ?? null,
    }));
  }

  async updateParticipant(
    spotlightUid: string,
    participantUid: string,
    data: {
      type?: TeamPitchParticipantType;
      access?: TeamPitchParticipantAccess;
      cohort?: SpvInvestorCohort | null;
      emailTemplateVariables?: Record<string, string> | null;
    }
  ) {
    const spotlight = await this.requireSpotlight(spotlightUid);
    const participant = await this.prisma.spvSpotlightParticipant.findFirst({
      where: { uid: participantUid, spvSpotlightUid: spotlightUid },
    });
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    if (data.cohort === 'PRE_APPROVED') {
      await this.clearOpenApplications(spotlightUid, participant.memberUid);
      await this.enableApproveOnLogin(participant.memberUid);
    }
    const typeDefaults =
      data.type === undefined || data.type === participant.type
        ? {}
        : data.type === 'FOUNDER'
        ? { cohort: null, access: defaultAccessForParticipantType('FOUNDER'), teamUid: spotlight.teamUid }
        : { cohort: SpvInvestorCohort.OUTREACH, access: defaultAccessForParticipantType('INVESTOR'), teamUid: null };
    return this.prisma.spvSpotlightParticipant.update({
      where: { uid: participantUid },
      data: {
        ...typeDefaults,
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.access !== undefined ? { access: data.access } : {}),
        ...(data.cohort !== undefined ? { cohort: data.cohort } : {}),
        ...(data.emailTemplateVariables !== undefined
          ? {
              emailTemplateVariables:
                data.emailTemplateVariables === null ? Prisma.DbNull : data.emailTemplateVariables,
            }
          : {}),
      },
      include: { member: { select: { uid: true, name: true, email: true } } },
    });
  }

  async removeParticipant(spotlightUid: string, participantUid: string) {
    const participant = await this.prisma.spvSpotlightParticipant.findFirst({
      where: { uid: participantUid, spvSpotlightUid: spotlightUid },
    });
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    await this.prisma.spvSpotlightParticipant.delete({ where: { uid: participantUid } });
    await this.revokeApprovedApplications(spotlightUid, [participant.memberUid]);
    return { success: true };
  }

  async removeParticipantsBulk(spotlightUid: string, participantUids: string[]) {
    await this.requireSpotlight(spotlightUid);
    const participants = await this.prisma.spvSpotlightParticipant.findMany({
      where: { spvSpotlightUid: spotlightUid, uid: { in: participantUids } },
      select: { memberUid: true },
    });
    const result = await this.prisma.spvSpotlightParticipant.deleteMany({
      where: { spvSpotlightUid: spotlightUid, uid: { in: participantUids } },
    });
    await this.revokeApprovedApplications(
      spotlightUid,
      participants.map((participant) => participant.memberUid)
    );
    return { removed: result.count };
  }

  async addParticipant(
    spotlightUid: string,
    data: {
      memberUid?: string;
      email?: string;
      name?: string;
      type: 'INVESTOR' | 'FOUNDER';
      cohort?: SpvInvestorCohort;
    }
  ) {
    const spotlight = await this.requireSpotlight(spotlightUid);
    const cohort = data.type === 'INVESTOR' ? data.cohort ?? 'PRE_APPROVED' : null;
    let member: { uid: string };

    if (data.memberUid) {
      const found = await this.prisma.member.findUnique({ where: { uid: data.memberUid } });
      if (!found) {
        throw new BadRequestException('Member not found');
      }
      if (data.type === 'INVESTOR') {
        if (!found.email) {
          throw new BadRequestException('Member has no email');
        }
        member = await this.upsertInvestorMember(
          normalizeEmail(found.email),
          found.name || found.email,
          cohort === 'PRE_APPROVED'
        );
      } else {
        member = found;
      }
    } else if (data.email) {
      const email = normalizeEmail(data.email);
      const name = data.name?.trim() || email;
      if (data.type === 'INVESTOR') {
        member = await this.upsertInvestorMember(email, name, cohort === 'PRE_APPROVED');
      } else {
        const existing = await this.prisma.member.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        });
        member =
          existing ??
          (await this.prisma.member.create({
            data: {
              email,
              name,
              approveOnLogin: true,
              memberApproval: {
                create: { state: 'PENDING', reason: 'Auto-created for SPV Spotlight participant' },
              },
            },
          }));
      }
    } else {
      throw new BadRequestException('Either memberUid or email must be provided');
    }

    const existingParticipant = await this.prisma.spvSpotlightParticipant.findUnique({
      where: { spvSpotlightUid_memberUid: { spvSpotlightUid: spotlight.uid, memberUid: member.uid } },
    });
    if (existingParticipant) {
      throw new ConflictException('Participant already exists for this spotlight');
    }

    if (cohort === 'PRE_APPROVED') {
      await this.clearOpenApplications(spotlight.uid, member.uid);
    }
    return this.prisma.spvSpotlightParticipant.create({
      data: {
        spvSpotlightUid: spotlight.uid,
        memberUid: member.uid,
        type: data.type,
        access: defaultAccessForParticipantType(data.type),
        cohort,
        teamUid: data.type === 'FOUNDER' ? spotlight.teamUid : null,
      },
      include: { member: { select: { uid: true, name: true, email: true } } },
    });
  }

  async addParticipantsBulk(
    spotlightUid: string,
    cohort: SpvInvestorCohort,
    participants: { email: string; name?: string; emailTemplateVariables?: Record<string, string> }[]
  ) {
    const spotlight = await this.requireSpotlight(spotlightUid);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of participants) {
      const email = normalizeEmail(row.email);
      const member = await this.upsertInvestorMember(email, row.name?.trim() || email, cohort === 'PRE_APPROVED');
      const existing = await this.prisma.spvSpotlightParticipant.findUnique({
        where: { spvSpotlightUid_memberUid: { spvSpotlightUid: spotlight.uid, memberUid: member.uid } },
      });
      if (existing?.type === 'INVESTOR' && existing.cohort === 'PRE_APPROVED' && cohort === 'OUTREACH') {
        skipped += 1;
        continue;
      }
      const variables = row.emailTemplateVariables ?? null;
      if (existing) {
        await this.prisma.spvSpotlightParticipant.update({
          where: { uid: existing.uid },
          data: {
            cohort,
            type: 'INVESTOR',
            ...(variables
              ? { emailTemplateVariables: { ...asStringRecord(existing.emailTemplateVariables), ...variables } }
              : {}),
          },
        });
        updated += 1;
      } else {
        await this.prisma.spvSpotlightParticipant.create({
          data: {
            spvSpotlightUid: spotlight.uid,
            memberUid: member.uid,
            type: 'INVESTOR',
            access: 'VIEW',
            cohort,
            ...(variables ? { emailTemplateVariables: variables } : {}),
          },
        });
        created += 1;
      }
      if (cohort === 'PRE_APPROVED') {
        await this.clearOpenApplications(spotlight.uid, member.uid);
      }
    }
    return { created, updated, skipped };
  }

  async listAccessRequests(uid: string) {
    await this.requireSpotlight(uid);
    return this.prisma.spvAccessRequest.findMany({
      where: { spvSpotlightUid: uid },
      orderBy: { createdAt: 'desc' },
      include: { member: { select: { uid: true, name: true, email: true } } },
    });
  }

  async approveAccessRequest(spotlightUid: string, requestUid: string) {
    const request = await this.prisma.spvAccessRequest.findFirst({
      where: { uid: requestUid, spvSpotlightUid: spotlightUid },
      include: {
        member: { select: { uid: true, name: true, email: true } },
        spvSpotlight: { include: { team: { select: { name: true } } } },
      },
    });
    if (!request) {
      throw new NotFoundException('Access request not found');
    }
    if (request.status === 'APPROVED') {
      throw new BadRequestException('Request is already approved');
    }
    if (!request.member.email) {
      throw new BadRequestException('Member has no email');
    }
    await this.prisma.spvAccessRequest.update({
      where: { uid: request.uid },
      data: { status: 'APPROVED' },
    });
    const participant = await this.prisma.spvSpotlightParticipant.upsert({
      where: { spvSpotlightUid_memberUid: { spvSpotlightUid: request.spvSpotlightUid, memberUid: request.member.uid } },
      create: {
        spvSpotlightUid: request.spvSpotlightUid,
        memberUid: request.member.uid,
        type: 'INVESTOR',
        access: 'VIEW',
      },
      update: {},
    });
    await this.enableApproveOnLogin(request.member.uid);
    const templates = asEmailTemplates(request.spvSpotlight.emailTemplates, request.spvSpotlight.title);
    await this.mailer.send({
      spotlight: this.mailContext(request.spvSpotlight),
      template: templates.approved,
      to: request.member.email,
      memberUid: request.member.uid,
      memberName: request.member.name || '',
      extra: {
        ...asStringRecord(participant.emailTemplateVariables),
        role: request.role,
        organization: request.organization,
      },
    });
    return { success: true };
  }

  async rejectAccessRequest(spotlightUid: string, requestUid: string) {
    const request = await this.prisma.spvAccessRequest.findFirst({
      where: { uid: requestUid, spvSpotlightUid: spotlightUid },
    });
    if (!request) {
      throw new NotFoundException('Access request not found');
    }
    if (request.status !== 'PENDING') {
      throw new BadRequestException('Only a pending request can be rejected');
    }
    await this.prisma.spvAccessRequest.update({
      where: { uid: request.uid },
      data: { status: 'REJECTED' },
    });
    return { success: true };
  }

  async openNoticePreview(uid: string) {
    const recipients = await this.openNoticeRecipients(uid);
    return openNoticeCounts(recipients);
  }

  async sendOpenNotice(uid: string, includeAlreadySent: boolean, participantUids?: string[]) {
    throw new BadRequestException('Open notice emails are disabled');
    const spotlight = await this.prisma.spvSpotlight.findUnique({
      where: { uid },
      include: { team: { select: { name: true } } },
    });
    if (!spotlight) {
      throw new NotFoundException('SPV spotlight not found');
    }
    const templates = asEmailTemplates(spotlight.emailTemplates, spotlight.title);
    const recipients = await this.openNoticeRecipients(uid, participantUids);
    const targets = recipients.filter((recipient) => includeAlreadySent || !recipient.sent);
    let sent = 0;
    let errors = 0;
    for (const recipient of targets) {
      try {
        await this.mailer.send({
          spotlight: this.mailContext(spotlight),
          template: templates.opened,
          to: recipient.email,
          memberUid: recipient.memberUid,
          memberName: recipient.name,
          extra: recipient.variables,
        });
        if (recipient.participantUid) {
          await this.prisma.spvSpotlightParticipant.update({
            where: { uid: recipient.participantUid },
            data: { openNoticeSentAt: new Date(), openNoticeSentCount: { increment: 1 } },
          });
        }
        if (recipient.requestUid) {
          await this.prisma.spvAccessRequest.update({
            where: { uid: recipient.requestUid },
            data: { openNoticeSentAt: new Date(), openNoticeSentCount: { increment: 1 } },
          });
        }
        sent += 1;
      } catch {
        errors += 1;
      }
    }
    return { summary: { totalEligible: targets.length, sent, skipped: recipients.length - targets.length, errors } };
  }

  async exportLoginLinks(uid: string) {
    const spotlight = await this.prisma.spvSpotlight.findUnique({
      where: { uid },
      include: { team: { select: { name: true } } },
    });
    if (!spotlight) {
      throw new NotFoundException('SPV spotlight not found');
    }
    const [participants, rejected] = await Promise.all([
      this.prisma.spvSpotlightParticipant.findMany({
        where: { spvSpotlightUid: uid, type: 'INVESTOR', access: { not: 'RESTRICTED' }, cohort: { not: null } },
        include: { member: { select: { uid: true, name: true, email: true } } },
      }),
      this.prisma.spvAccessRequest.findMany({
        where: { spvSpotlightUid: uid, status: 'REJECTED' },
        select: { memberUid: true },
      }),
    ]);
    const rejectedMembers = new Set(rejected.map((request) => request.memberUid));
    const rows: { email: string; name: string; cohort: string; url: string }[] = [];
    for (const participant of participants) {
      if (!participant.member.email || !participant.cohort || rejectedMembers.has(participant.memberUid)) {
        continue;
      }
      try {
        const url = await this.mailer.loginLink(spotlight.slug, participant.member.email);
        rows.push({
          email: participant.member.email,
          name: participant.member.name || '',
          cohort: participant.cohort,
          url,
        });
      } catch {
        // Skip members the auth service cannot tokenise.
      }
    }
    return { rows };
  }

  async sendInvites(uid: string, includeAlreadyInvited: boolean, participantUids?: string[]) {
    return this.sendCohortEmail(uid, 'invite', includeAlreadyInvited, participantUids);
  }

  async sendFollowUps(uid: string, includeAlreadyFollowedUp: boolean, participantUids?: string[]) {
    return this.sendCohortEmail(uid, 'followUp', includeAlreadyFollowedUp, participantUids);
  }

  private async sendCohortEmail(
    uid: string,
    kind: 'invite' | 'followUp',
    includeAlreadySent: boolean,
    participantUids?: string[]
  ) {
    const spotlight = await this.prisma.spvSpotlight.findUnique({
      where: { uid },
      include: { team: { select: { name: true } } },
    });
    if (!spotlight) {
      throw new NotFoundException('SPV spotlight not found');
    }
    const templates = asEmailTemplates(spotlight.emailTemplates, spotlight.title);
    const participants = await this.prisma.spvSpotlightParticipant.findMany({
      where: {
        spvSpotlightUid: uid,
        type: 'INVESTOR',
        access: { not: 'RESTRICTED' },
        cohort: { in: ['PRE_APPROVED', 'OUTREACH'] },
        ...(participantUids ? { uid: { in: participantUids } } : {}),
      },
      include: { member: { select: { uid: true, name: true, email: true } } },
    });
    let sent = 0;
    let skipped = 0;
    let errors = 0;
    const rows: {
      participantUid: string;
      email: string | null;
      status: 'sent' | 'skipped' | 'error';
      message?: string;
    }[] = [];
    for (const participant of participants) {
      const already = kind === 'invite' ? participant.inviteSentCount > 0 : participant.followUpSentCount > 0;
      if (!participant.member.email) {
        errors += 1;
        rows.push({ participantUid: participant.uid, email: null, status: 'error', message: 'No email' });
        continue;
      }
      if (already && !includeAlreadySent) {
        skipped += 1;
        rows.push({ participantUid: participant.uid, email: participant.member.email, status: 'skipped' });
        continue;
      }
      const key: EmailTemplateKey =
        kind === 'invite'
          ? participant.cohort === 'OUTREACH'
            ? 'inviteOutreach'
            : 'invitePreapproved'
          : participant.cohort === 'OUTREACH'
          ? 'followUpOutreach'
          : 'followUpPreapproved';
      try {
        await this.mailer.send({
          spotlight: this.mailContext(spotlight),
          template: templates[key],
          to: participant.member.email,
          memberUid: participant.member.uid,
          memberName: participant.member.name || '',
          extra: asStringRecord(participant.emailTemplateVariables),
        });
        await this.prisma.spvSpotlightParticipant.update({
          where: { uid: participant.uid },
          data:
            kind === 'invite'
              ? { inviteSentAt: new Date(), inviteSentCount: { increment: 1 } }
              : { followUpSentAt: new Date(), followUpSentCount: { increment: 1 } },
        });
        sent += 1;
        rows.push({ participantUid: participant.uid, email: participant.member.email, status: 'sent' });
      } catch (error) {
        errors += 1;
        rows.push({
          participantUid: participant.uid,
          email: participant.member.email,
          status: 'error',
          message: error instanceof Error ? error.message : 'Send failed',
        });
      }
    }
    return { summary: { totalEligible: participants.length, sent, skipped, errors }, rows };
  }

  private async openNoticeRecipients(uid: string, participantUids?: string[]) {
    await this.requireSpotlight(uid);
    const [participants, requests] = await Promise.all([
      this.prisma.spvSpotlightParticipant.findMany({
        where: {
          spvSpotlightUid: uid,
          type: 'INVESTOR',
          access: { not: 'RESTRICTED' },
          ...(participantUids ? { uid: { in: participantUids } } : {}),
        },
        include: { member: { select: { uid: true, name: true, email: true } } },
      }),
      this.prisma.spvAccessRequest.findMany({
        where: { spvSpotlightUid: uid },
        select: { uid: true, memberUid: true, status: true, openNoticeSentCount: true },
      }),
    ]);
    const requestByMember = new Map(requests.map((request) => [request.memberUid, request]));
    return participants.flatMap((participant) => {
      const request = requestByMember.get(participant.memberUid);
      const hasAccess =
        request?.status === 'APPROVED' || (participant.cohort === 'PRE_APPROVED' && request?.status !== 'REJECTED');
      if (!hasAccess || !participant.member.email) {
        return [];
      }
      return [
        {
          memberUid: participant.member.uid,
          email: participant.member.email,
          name: participant.member.name || '',
          sent: participant.openNoticeSentCount > 0 || (request?.openNoticeSentCount ?? 0) > 0,
          participantUid: participant.uid,
          requestUid: request?.status === 'APPROVED' ? request.uid : undefined,
          variables: asStringRecord(participant.emailTemplateVariables),
        },
      ];
    });
  }

  private async upsertInvestorMember(email: string, name: string, approveOnLogin: boolean) {
    const existing = await this.prisma.member.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      include: { memberApproval: { select: { state: true } } },
    });
    if (!existing) {
      const created = await this.prisma.member.create({
        data: {
          email,
          name,
          approveOnLogin,
          memberApproval: {
            create: { state: 'PENDING', reason: 'Auto-created for SPV Spotlight participant' },
          },
        },
      });
      await upsertPolicyAssignmentByCode(this.prisma, created.uid, 'investor_pl');
      return created;
    }
    const state = existing.memberApproval?.state;
    if (state !== MemberApprovalState.APPROVED && state !== MemberApprovalState.VERIFIED) {
      if (approveOnLogin) {
        await this.prisma.member.update({
          where: { uid: existing.uid },
          data: { approveOnLogin: true },
        });
      }
      if (!existing.memberApproval) {
        await this.prisma.memberApproval.create({
          data: { memberUid: existing.uid, state: 'PENDING', reason: 'SPV Spotlight investor participant added' },
        });
      }
    }
    await upsertPolicyAssignmentByCode(this.prisma, existing.uid, 'investor_pl');
    return existing;
  }

  private async enableApproveOnLogin(memberUid: string) {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: { memberApproval: { select: { state: true } } },
    });
    const state = member?.memberApproval?.state;
    if (state === MemberApprovalState.APPROVED || state === MemberApprovalState.VERIFIED) {
      return;
    }
    await this.prisma.member.update({ where: { uid: memberUid }, data: { approveOnLogin: true } });
  }

  private async clearOpenApplications(spotlightUid: string, memberUid: string) {
    await this.prisma.spvAccessRequest.deleteMany({
      where: { spvSpotlightUid: spotlightUid, memberUid, status: { in: ['PENDING', 'REJECTED'] } },
    });
  }

  private async revokeApprovedApplications(spotlightUid: string, memberUids: string[]) {
    if (!memberUids.length) {
      return;
    }
    await this.prisma.spvAccessRequest.updateMany({
      where: { spvSpotlightUid: spotlightUid, memberUid: { in: memberUids }, status: 'APPROVED' },
      data: { status: 'REJECTED' },
    });
  }

  private async addTeamLeads(spotlightUid: string, teamUid: string) {
    const leads = await this.prisma.teamMemberRole.findMany({
      where: { teamUid, teamLead: true, endDate: null },
      select: { memberUid: true },
    });
    const memberUids = [...new Set(leads.map((lead) => lead.memberUid))];
    if (!memberUids.length) {
      return;
    }
    await this.prisma.spvSpotlightParticipant.createMany({
      data: memberUids.map((memberUid) => ({
        spvSpotlightUid: spotlightUid,
        memberUid,
        type: 'FOUNDER' as const,
        access: defaultAccessForParticipantType('FOUNDER'),
        teamUid,
      })),
      skipDuplicates: true,
    });
  }

  private async replaceMedia(spotlightUid: string, media: MediaInput[]) {
    await this.prisma.spvSpotlightMedia.deleteMany({ where: { spvSpotlightUid: spotlightUid } });
    if (!media.length) {
      return;
    }
    await this.prisma.spvSpotlightMedia.createMany({
      data: media.map((item, index) => ({
        spvSpotlightUid: spotlightUid,
        imageUid: item.imageUid,
        alt: item.alt.trim(),
        fit: item.fit === 'contain' ? 'contain' : 'cover',
        sortOrder: index,
      })),
    });
  }

  private async uniqueSlug(base: string) {
    const root = base || 'spv-spotlight';
    let slug = root;
    let n = 2;
    while (await this.prisma.spvSpotlight.findUnique({ where: { slug }, select: { uid: true } })) {
      slug = `${root}-${n}`;
      n += 1;
    }
    return slug;
  }

  private async requireSpotlight(uid: string) {
    const spotlight = await this.prisma.spvSpotlight.findUnique({ where: { uid } });
    if (!spotlight) {
      throw new NotFoundException('SPV spotlight not found');
    }
    return spotlight;
  }

  private mailContext(spotlight: {
    uid: string;
    slug: string;
    title: string;
    supportEmail: string;
    senderEmail: string | null;
    senderName: string | null;
    replyToEmail: string | null;
    team: { name: string };
  }) {
    return {
      uid: spotlight.uid,
      slug: spotlight.slug,
      title: spotlight.title,
      supportEmail: spotlight.supportEmail,
      senderEmail: spotlight.senderEmail,
      senderName: spotlight.senderName,
      replyToEmail: spotlight.replyToEmail,
      teamName: spotlight.team.name,
    };
  }
}
