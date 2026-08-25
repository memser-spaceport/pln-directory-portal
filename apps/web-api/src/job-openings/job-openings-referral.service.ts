import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CreateJobReferralInput } from 'libs/contracts/src/schema/job-referral';
import { PrismaService } from '../shared/prisma.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { noteToHtml } from './job-openings-email-html';
import { resolveVisibleJobOpening } from './job-openings-resolve';
import { deriveReferralBlurb } from './job-openings-referral-blurb';

const JOB_BOARD_REFERRAL_TEMPLATE = 'JOB_BOARD_REFERRAL_EMAIL';

type ResolvedRecipient = { email: string; name: string | null };
type MemberHeadline = { title: string | null; companyName: string | null };

@Injectable()
export class JobOpeningsReferralService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationServiceClient: NotificationServiceClient
  ) {}

  async referJob(jobUid: string, referrerEmail: string | undefined, input: CreateJobReferralInput) {
    const referrer = await this.resolveReferrer(referrerEmail);
    const jobOpening = await resolveVisibleJobOpening(this.prisma, jobUid);

    const referred = await this.prisma.member.findUnique({
      where: { uid: input.referredMemberUid },
      select: { uid: true, name: true, email: true, deletedAt: true },
    });
    if (!referred || referred.deletedAt || !referred.email) {
      throw new BadRequestException('Referred member not found');
    }

    const jobReferEmail = jobOpening.team.jobReferEmail?.trim() || null;
    const recipients = jobReferEmail
      ? [{ email: jobReferEmail, name: jobOpening.team.name }]
      : await this.resolveMemberRecipients(input.recipients);
    const { to, cc } = this.buildToAndCc(recipients, [
      { email: referrer.email, name: referrer.name },
      { email: referred.email, name: referred.name },
    ]);

    const note = input.note.trim();
    const applyUrl = jobOpening.sourceLink || null;

    await this.notificationServiceClient.sendNotification({
      isPriority: true,
      deliveryChannel: 'EMAIL',
      templateName: JOB_BOARD_REFERRAL_TEMPLATE,
      recipientsInfo: {
        to: [to],
        cc,
      },
      deliveryPayload: {
        body: {
          referrerName: referrer.name,
          referredName: referred.name,
          roleTitle: jobOpening.roleTitle,
          teamName: jobOpening.team.name,
          noteHtml: noteToHtml(note),
          applyUrl,
        },
      },
      entityType: 'JOB_OPENING',
      actionType: 'REFERRAL',
      sourceMeta: {
        activityId: jobOpening.uid,
        activityType: 'JOB_OPENING',
        activityUserId: referrer.uid,
        activityUserName: referrer.name,
      },
      targetMeta: {
        emailId: referred.email,
        userId: referred.uid,
        userName: referred.name,
      },
    });

    const record = await this.prisma.jobReferral.create({
      data: {
        jobOpeningUid: jobOpening.uid,
        referrerMemberUid: referrer.uid,
        referredMemberUid: referred.uid,
        toEmail: to,
        ccEmails: cc,
        note,
      },
    });

    return {
      uid: record.uid,
      jobUid: jobOpening.uid,
      to,
      cc,
      sentAt: record.createdAt.toISOString(),
    };
  }

  // Pre-filled "Your note" text for the referral modal. The candidate blurb
  // comes from the referred member's existing Member.bio (see the
  // member-bio-generation skill for how that's generated) — deliberately not
  // an AI call made from here, so opening the modal stays instant and free.
  async getReferralDraft(jobUid: string, referrerEmail: string | undefined, referredMemberUid: string) {
    const referrer = await this.resolveReferrer(referrerEmail);
    const jobOpening = await resolveVisibleJobOpening(this.prisma, jobUid);

    const referred = await this.prisma.member.findUnique({
      where: { uid: referredMemberUid },
      select: { uid: true, name: true, bio: true, deletedAt: true },
    });
    if (!referred || referred.deletedAt) {
      throw new BadRequestException('Referred member not found');
    }

    const [referrerHeadline, referredHeadline] = await Promise.all([
      this.resolveHeadline(referrer.uid),
      this.resolveHeadline(referred.uid),
    ]);

    const applyUrl = jobOpening.sourceLink || null;
    const blurb = deriveReferralBlurb(referred.bio);

    // A bio's own leading sentence already restates "X is TITLE at COMPANY"
    // (that's how the Husky bio prompt is structured), so composing the same
    // clause here would duplicate it. Only compose it as a fallback when
    // there's no bio to draw from.
    let aboutParagraph = blurb ?? '';
    if (!aboutParagraph && referredHeadline.title) {
      aboutParagraph = `${referred.name} is ${referredHeadline.title}`;
      if (referredHeadline.companyName) aboutParagraph += ` at ${referredHeadline.companyName}`;
      aboutParagraph += '.';
    }

    let signature = `— ${referrer.name}`;
    if (referrerHeadline.title) signature += `, ${referrerHeadline.title}`;
    if (referrerHeadline.companyName) signature += ` at ${referrerHeadline.companyName}`;

    const paragraphs = [
      `Hi ${jobOpening.team.name} team,\nI'd like to refer ${referred.name} for your ${jobOpening.roleTitle} role.`,
      aboutParagraph,
      signature,
    ].filter((paragraph) => paragraph.length > 0);

    return {
      note: paragraphs.join('\n\n'),
      referrerName: referrer.name,
      referrerTitle: referrerHeadline.title,
      referrerCompany: referrerHeadline.companyName,
      referredName: referred.name,
      referredTitle: referredHeadline.title,
      referredCompany: referredHeadline.companyName,
      roleTitle: jobOpening.roleTitle,
      teamName: jobOpening.team.name,
      applyUrl,
    };
  }

  // Title/company for the referral sentence. Prefers the member's main team
  // role (e.g. "Staff Engineer" at "Filecoin Foundation"), falling back to
  // any other team role, then to the member's own free-text `role` with no
  // company. Draft-only — the POST /referrals payload doesn't depend on this.
  private async resolveHeadline(memberUid: string): Promise<MemberHeadline> {
    const [teamRole, member] = await Promise.all([
      this.prisma.teamMemberRole.findFirst({
        where: { memberUid },
        orderBy: { mainTeam: 'desc' },
        select: { role: true, team: { select: { name: true } } },
      }),
      this.prisma.member.findUnique({ where: { uid: memberUid }, select: { role: true } }),
    ]);
    if (teamRole) {
      return { title: teamRole.role ?? member?.role ?? null, companyName: teamRole.team.name };
    }
    return { title: member?.role ?? null, companyName: null };
  }

  private async resolveReferrer(email: string | undefined) {
    if (!email) {
      throw new UnauthorizedException('Authenticated email required');
    }
    const member = await this.prisma.member.findUnique({
      where: { email },
      select: { uid: true, name: true, email: true, deletedAt: true },
    });
    if (!member || member.deletedAt || !member.email) {
      throw new UnauthorizedException('Member not found');
    }
    return { uid: member.uid, name: member.name, email: member.email };
  }

  private async resolveMemberRecipients(
    recipients: CreateJobReferralInput['recipients']
  ): Promise<ResolvedRecipient[]> {
    if (!recipients?.length) {
      throw new BadRequestException('At least one recipient is required');
    }

    const memberUids = recipients.map((recipient) => recipient.memberUid).filter((uid): uid is string => Boolean(uid));

    const members = memberUids.length
      ? await this.prisma.member.findMany({
          where: { uid: { in: memberUids } },
          select: { uid: true, name: true, email: true, deletedAt: true },
        })
      : [];
    const memberByUid = new Map(members.map((member) => [member.uid, member]));

    return recipients.map((recipient) => {
      if (recipient.memberUid) {
        const member = memberByUid.get(recipient.memberUid);
        if (!member || member.deletedAt || !member.email) {
          throw new BadRequestException(`Recipient member ${recipient.memberUid} not found`);
        }
        return { email: member.email, name: member.name };
      }
      return { email: recipient.email as string, name: recipient.name ?? null };
    });
  }

  private buildToAndCc(recipients: ResolvedRecipient[], extraCc: ResolvedRecipient[]): { to: string; cc: string[] } {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const recipient of [...recipients, ...extraCc]) {
      const key = recipient.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      ordered.push(recipient.email);
    }
    const [to, ...cc] = ordered;
    return { to, cc };
  }
}
