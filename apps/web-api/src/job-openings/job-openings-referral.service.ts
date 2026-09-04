import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CreateJobReferralInput } from 'libs/contracts/src/schema/job-referral';
import { PrismaService } from '../shared/prisma.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { noteToHtml } from './job-openings-email-html';
import { parseJobReferCcEmails, resolveVisibleJobOpening } from './job-openings-resolve';
import { deriveReferralBlurb } from './job-openings-referral-blurb';
import { jobBoardDetailUrl } from './job-openings-url';

const JOB_BOARD_REFERRAL_TEMPLATE = 'JOB_BOARD_REFERRAL_EMAIL';
// Sent only when the referrer didn't CC the referred person on the main referral email above.
const JOB_BOARD_REFERRAL_NOTICE_TEMPLATE = 'JOB_BOARD_REFERRAL_NOTICE_EMAIL';

type ResolvedRecipient = { email: string; name: string | null };
type MemberHeadline = { title: string | null; companyName: string | null };
type MemberLocation = { city: string | null; country: string } | null;
const PROFILE_CARD_SKILLS_LIMIT = 3;

const firstName = (name: string): string => name.trim().split(/\s+/)[0];

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
      select: {
        uid: true,
        name: true,
        email: true,
        deletedAt: true,
        location: { select: { city: true, country: true } },
        skills: { select: { title: true } },
      },
    });
    if (!referred || referred.deletedAt || !referred.email) {
      throw new BadRequestException('Referred member not found');
    }

    const jobReferEmail = jobOpening.team.jobReferEmail?.trim() || null;
    const recipients = jobReferEmail
      ? [{ email: jobReferEmail, name: jobOpening.team.name }]
      : await this.resolveMemberRecipients(input.recipients);
    const jobReferCc = jobReferEmail
      ? parseJobReferCcEmails(jobOpening.team.jobReferCcEmails).map((email) => ({
          email,
          name: jobOpening.team.name,
        }))
      : [];
    // Checked by default in the modal, so omitting the field preserves the old
    // unconditional-cc behaviour. Unchecked, the referred person gets a separate
    // notice below instead of being cc'd here.
    const includeReferredMember = input.includeReferredMember !== false;
    const { to, cc } = this.buildToAndCc(recipients, [
      ...jobReferCc,
      { email: referrer.email, name: referrer.name },
      ...(includeReferredMember ? [{ email: referred.email, name: referred.name }] : []),
    ]);
    const recipientGreetingName = jobReferEmail ? `${jobOpening.team.name} team` : recipients[0]?.name || 'there';

    const note = input.note.trim();
    const applyUrl = jobBoardDetailUrl(jobOpening.uid);
    const [referrerHeadline, referredHeadline] = await Promise.all([
      this.resolveHeadline(referrer.uid),
      this.resolveHeadline(referred.uid),
    ]);

    await this.notificationServiceClient.sendNotification({
      isPriority: true,
      deliveryChannel: 'EMAIL',
      templateName: JOB_BOARD_REFERRAL_TEMPLATE,
      recipientsInfo: {
        to: [to],
        cc,
        replyTo: includeReferredMember ? `${referrer.email}, ${referred.email}` : referrer.email,
        bcc: process.env.LABOS_EMAIL ? [process.env.LABOS_EMAIL] : [],
      },
      deliveryPayload: {
        body: {
          referrer: this.buildMemberCard(referrer, referrerHeadline),
          referred: this.buildMemberCard(referred, referredHeadline),
          roleTitle: jobOpening.roleTitle,
          teamName: jobOpening.team.name,
          noteHtml: noteToHtml(note),
          applyUrl,
          recipientGreetingName,
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

    if (!includeReferredMember) {
      await this.notificationServiceClient.sendNotification({
        isPriority: true,
        deliveryChannel: 'EMAIL',
        templateName: JOB_BOARD_REFERRAL_NOTICE_TEMPLATE,
        recipientsInfo: {
          to: [referred.email],
          replyTo: referrer.email,
        },
        deliveryPayload: {
          body: {
            referredFirstName: firstName(referred.name),
            referrerFirstName: firstName(referrer.name),
            referrer: this.buildMemberCard(referrer, referrerHeadline),
            roleTitle: jobOpening.roleTitle,
            teamName: jobOpening.team.name,
            noteHtml: noteToHtml(note),
            applyUrl,
          },
        },
        entityType: 'JOB_OPENING',
        actionType: 'REFERRAL_NOTICE',
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
    }

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

    const applyUrl = jobBoardDetailUrl(jobOpening.uid);
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

    // How the referrer knows the person is still the one line this can't draft — it is in
    // nobody's record — but the draft no longer leaves a bracketed slot for it.
    //
    // A `[Add a line about how you know <First>.]` paragraph used to sit here. It made the
    // referrer *delete* text before they could write their own, in a field whose caption
    // already asks for the same thing in words ("Add how you know <First> — that's the one
    // thing the draft can't fill in", refer modal). Two asks, and only one of them left
    // litter in the note if it went unanswered — a referral could be sent with the bracket
    // still in it, and some were.
    //
    // The ask now lives on the client, above the box, where it costs the writer nothing to
    // ignore. What this returns is a note that is finished as it stands.
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
      select: {
        uid: true,
        name: true,
        email: true,
        deletedAt: true,
        location: { select: { city: true, country: true } },
        skills: { select: { title: true } },
      },
    });
    if (!member || member.deletedAt || !member.email) {
      throw new UnauthorizedException('Member not found');
    }
    return {
      uid: member.uid,
      name: member.name,
      email: member.email,
      location: member.location,
      skills: member.skills,
    };
  }

  // "Title, Company" for a profile card, e.g. "Staff Engineer, Filecoin Foundation".
  private formatHeadline(headline: MemberHeadline): string | null {
    if (headline.title && headline.companyName) return `${headline.title}, ${headline.companyName}`;
    return headline.title ?? null;
  }

  private formatLocation(location: MemberLocation): string | null {
    if (!location) return null;
    return [location.city, location.country].filter(Boolean).join(', ') || null;
  }

  private profileUrl(memberUid: string): string {
    return `${process.env.WEB_UI_BASE_URL}/members/${memberUid}`;
  }

  // Shape consumed by the `memberCard` partial in the JOB_BOARD_REFERRAL_EMAIL template.
  private buildMemberCard(
    member: { uid: string; name: string | null; location: MemberLocation; skills: { title: string }[] },
    headline: MemberHeadline
  ) {
    return {
      name: member.name,
      profileUrl: this.profileUrl(member.uid),
      headline: this.formatHeadline(headline),
      location: this.formatLocation(member.location),
      skills: member.skills.map((skill) => skill.title).slice(0, PROFILE_CARD_SKILLS_LIMIT),
    };
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
