import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { CreateJobReferralInput } from 'libs/contracts/src/schema/job-referral';
import { PrismaService } from '../shared/prisma.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { HIDDEN_JOB_OPENING_STATUSES } from './job-openings-query.service';

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

    const jobOpening = await this.prisma.jobOpening.findUnique({
      where: { uid: jobUid },
      select: {
        uid: true,
        roleTitle: true,
        sourceLink: true,
        status: true,
        team: { select: { uid: true, name: true } },
      },
    });
    if (!jobOpening || !jobOpening.team || HIDDEN_JOB_OPENING_STATUSES.includes(jobOpening.status)) {
      throw new NotFoundException('Job opening not found');
    }

    const referred = await this.prisma.member.findUnique({
      where: { uid: input.referredMemberUid },
      select: { uid: true, name: true, email: true, role: true, deletedAt: true },
    });
    if (!referred || referred.deletedAt || !referred.email) {
      throw new BadRequestException('Referred member not found');
    }

    const recipients = await this.resolveRecipients(input.recipients);
    const { to, cc } = this.buildToAndCc(recipients, [
      { email: referrer.email, name: referrer.name },
      { email: referred.email, name: referred.name },
    ]);

    const [referrerHeadline, referredHeadline] = await Promise.all([
      this.resolveHeadline(referrer.uid, referrer.role),
      this.resolveHeadline(referred.uid, referred.role),
    ]);

    const message = input.message?.trim() || null;
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
          teamName: jobOpening.team.name,
          roleTitle: jobOpening.roleTitle,
          referredName: referred.name,
          referredTitle: referredHeadline.title,
          referredCompany: referredHeadline.companyName,
          referrerName: referrer.name,
          referrerTitle: referrerHeadline.title,
          referrerTeam: referrerHeadline.companyName,
          message,
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
        message,
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

  private async resolveReferrer(email: string | undefined) {
    if (!email) {
      throw new UnauthorizedException('Authenticated email required');
    }
    const member = await this.prisma.member.findUnique({
      where: { email },
      select: { uid: true, name: true, email: true, role: true, deletedAt: true },
    });
    if (!member || member.deletedAt || !member.email) {
      throw new UnauthorizedException('Member not found');
    }
    return { uid: member.uid, name: member.name, email: member.email, role: member.role };
  }

  // Title/company for the referral sentence. Prefers the member's main team
  // role (e.g. "Staff Engineer" at "Filecoin Foundation"), falling back to
  // any other team role, then to the member's own free-text `role` with no
  // company. Kept server-side (rather than client-supplied) so the template
  // always reflects current Directory data.
  private async resolveHeadline(memberUid: string, fallbackTitle: string | null): Promise<MemberHeadline> {
    const teamRole = await this.prisma.teamMemberRole.findFirst({
      where: { memberUid },
      orderBy: { mainTeam: 'desc' },
      select: { role: true, team: { select: { name: true } } },
    });
    if (teamRole) {
      return { title: teamRole.role ?? fallbackTitle, companyName: teamRole.team.name };
    }
    return { title: fallbackTitle, companyName: null };
  }

  private async resolveRecipients(recipients: CreateJobReferralInput['recipients']): Promise<ResolvedRecipient[]> {
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
