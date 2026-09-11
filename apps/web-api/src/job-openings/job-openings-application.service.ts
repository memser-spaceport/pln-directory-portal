import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type { CreateJobApplicationInput } from 'libs/contracts/src/schema/job-application';
import { PrismaService } from '../shared/prisma.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { directoryVisibleMemberWhere } from '../members/member-visibility';
import { MEMBER_APPROVED, MemberApprovedPayload } from '../member-approvals/member-approvals.events';
import { noteToHtml } from './job-openings-email-html';
import { parseJobReferCcEmails, resolveVisibleJobOpening, type ResolvedJobOpening } from './job-openings-resolve';
import { isProtocolLabsTeam } from './pin-protocol-labs-team';
import { JOB_APPLICATION_EMAIL_UTM_SOURCE, jobBoardDetailUrl, memberProfileEmailUrl } from './job-openings-url';

const JOB_BOARD_APPLICATION_TEMPLATE = 'JOB_BOARD_APPLICATION_EMAIL';
const PROFILE_CARD_SKILLS_LIMIT = 3;

type ApplicantLocation = { city: string | null; country: string; region: string | null } | null;
type MemberHeadline = { title: string | null; companyName: string | null };
type Recipient = { uid: string; name: string; email: string };

type Applicant = {
  uid: string;
  name: string;
  email: string;
  role: string | null;
  currentCompany: string | null;
  jobSearchStatus: string | null;
  bio: string | null;
  githubHandler: string | null;
  linkedinHandler: string | null;
  location: ApplicantLocation;
  skills: Array<{ title: string }>;
  experiences: Array<{
    title: string;
    company: string;
    location: string | null;
    startDate: Date;
    endDate: Date | null;
    isCurrent: boolean;
    description: string | null;
  }>;
  projectContributions: Array<{
    role: string | null;
    description: string | null;
    currentProject: boolean | null;
    startDate: Date | null;
    endDate: Date | null;
    project: { name: string } | null;
  }>;
  teamMemberRoles: Array<{ mainTeam: boolean; role: string | null; team: { name: string } }>;
};

@Injectable()
export class JobOpeningsApplicationService {
  private readonly logger = new Logger(JobOpeningsApplicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationServiceClient: NotificationServiceClient
  ) {}

  async apply(jobUid: string, applicantEmail: string | undefined, input: CreateJobApplicationInput) {
    const applicant = await this.resolveApplicant(applicantEmail);

    const existing = await this.prisma.jobApplication.findUnique({
      where: { jobOpeningUid_memberUid: { jobOpeningUid: jobUid, memberUid: applicant.uid } },
      select: { uid: true },
    });
    if (existing) {
      throw new ConflictException('Already applied to this job');
    }

    const jobOpening = await resolveVisibleJobOpening(this.prisma, jobUid);
    const { to, cc } = await this.resolveApplicationRecipients(jobOpening);

    // An unapproved member without a visible profile would send leads a link they cannot open,
    // so the email waits until approval (see sendPendingApplications).
    const profileVisible = await this.isProfileVisible(applicant.uid);
    if (profileVisible) {
      await this.sendApplicationEmail(applicant, jobOpening, to, cc, input.coverLetter);
    }

    try {
      const record = await this.prisma.jobApplication.create({
        data: {
          jobOpeningUid: jobOpening.uid,
          memberUid: applicant.uid,
          coverLetter: input.coverLetter.trim(),
          profileSnapshot: this.buildProfileSnapshot(applicant),
          toEmail: to.email,
          ccEmails: cc.map((lead) => lead.email),
          sentAt: profileVisible ? new Date() : null,
        },
      });

      return {
        uid: record.uid,
        jobUid: jobOpening.uid,
        appliedAt: record.createdAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Already applied to this job');
      }
      throw error;
    }
  }

  @OnEvent(MEMBER_APPROVED)
  async onMemberApproved(payload: MemberApprovedPayload) {
    try {
      await this.sendPendingApplications(payload.memberUid);
    } catch (error) {
      this.logger.error(
        `Pending job applications for member ${payload.memberUid} not sent: ${error?.message ?? error}`
      );
    }
  }

  async sendPendingApplications(memberUid: string) {
    const pending = await this.prisma.jobApplication.findMany({
      where: { memberUid, sentAt: null },
      select: { uid: true, jobOpeningUid: true, coverLetter: true },
    });
    if (pending.length === 0) return;

    const applicant = await this.findApplicant({ uid: memberUid });
    if (!applicant || !(await this.isProfileVisible(memberUid))) return;

    for (const application of pending) {
      let jobOpening: ResolvedJobOpening;
      let recipients: { to: Recipient; cc: Recipient[] };
      try {
        jobOpening = await resolveVisibleJobOpening(this.prisma, application.jobOpeningUid);
        recipients = await this.resolveApplicationRecipients(jobOpening);
      } catch (error) {
        this.logger.warn(`Pending job application ${application.uid} not sent: ${error?.message ?? error}`);
        continue;
      }

      // Claim the row before sending so concurrent approval events cannot both email the leads.
      // The claim is kept even if the send fails: a lost email beats a duplicate one.
      const claimed = await this.prisma.jobApplication.updateMany({
        where: { uid: application.uid, sentAt: null },
        data: {
          profileSnapshot: this.buildProfileSnapshot(applicant),
          toEmail: recipients.to.email,
          ccEmails: recipients.cc.map((lead) => lead.email),
          sentAt: new Date(),
        },
      });
      if (claimed.count === 0) continue;

      try {
        await this.sendApplicationEmail(applicant, jobOpening, recipients.to, recipients.cc, application.coverLetter);
      } catch (error) {
        this.logger.error(
          `Pending job application ${application.uid} marked sent but email failed: ${error?.message ?? error}`
        );
      }
    }
  }

  private async isProfileVisible(memberUid: string): Promise<boolean> {
    const count = await this.prisma.member.count({ where: { uid: memberUid, ...directoryVisibleMemberWhere() } });
    return count > 0;
  }

  private async sendApplicationEmail(
    applicant: Applicant,
    jobOpening: ResolvedJobOpening,
    to: Recipient,
    cc: Recipient[],
    coverLetter: string
  ) {
    const coverLetterHtml = noteToHtml(coverLetter);
    const jobBoardUrl = jobBoardDetailUrl(jobOpening.uid);

    await this.notificationServiceClient.sendNotification({
      isPriority: true,
      deliveryChannel: 'EMAIL',
      templateName: JOB_BOARD_APPLICATION_TEMPLATE,
      recipientsInfo: {
        to: [to.email],
        cc: cc.map((lead) => lead.email),
        bcc: process.env.LABOS_EMAIL ? [process.env.LABOS_EMAIL] : [],
        replyTo: applicant.email,
      },
      deliveryPayload: {
        body: {
          applicant: this.buildMemberCard(applicant, jobOpening.uid),
          roleTitle: jobOpening.roleTitle,
          teamName: jobOpening.team.name,
          coverLetterHtml,
          applyUrl: jobBoardUrl,
        },
      },
      entityType: 'JOB_OPENING',
      actionType: 'APPLICATION',
      sourceMeta: {
        activityId: jobOpening.uid,
        activityType: 'JOB_OPENING',
        activityUserId: applicant.uid,
        activityUserName: applicant.name,
      },
      targetMeta: {
        emailId: to.email,
        userId: to.uid,
        userName: to.name,
      },
    });
  }

  async listMine(applicantEmail: string | undefined) {
    const applicant = await this.resolveApplicant(applicantEmail);
    const applications = await this.prisma.jobApplication.findMany({
      where: { memberUid: applicant.uid },
      select: { uid: true, jobOpeningUid: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return {
      applications: applications.map((application) => ({
        uid: application.uid,
        jobUid: application.jobOpeningUid,
        appliedAt: application.createdAt.toISOString(),
      })),
    };
  }

  private async resolveApplicant(email: string | undefined): Promise<Applicant> {
    if (!email) {
      throw new UnauthorizedException('Authenticated email required');
    }
    const applicant = await this.findApplicant({ email });
    if (!applicant) {
      throw new UnauthorizedException('Member not found');
    }
    return applicant;
  }

  private async findApplicant(where: Prisma.MemberWhereUniqueInput): Promise<Applicant | null> {
    const member = await this.prisma.member.findUnique({
      where,
      select: {
        uid: true,
        name: true,
        email: true,
        role: true,
        currentCompany: true,
        jobSearchStatus: true,
        bio: true,
        githubHandler: true,
        linkedinHandler: true,
        deletedAt: true,
        location: { select: { city: true, country: true, region: true } },
        skills: { select: { title: true } },
        experiences: {
          select: {
            title: true,
            company: true,
            location: true,
            startDate: true,
            endDate: true,
            isCurrent: true,
            description: true,
          },
        },
        projectContributions: {
          select: {
            role: true,
            description: true,
            currentProject: true,
            startDate: true,
            endDate: true,
            project: { select: { name: true } },
          },
        },
        teamMemberRoles: {
          orderBy: { mainTeam: 'desc' },
          select: { mainTeam: true, role: true, team: { select: { name: true } } },
        },
      },
    });
    if (!member || member.deletedAt || !member.email) {
      return null;
    }

    return {
      uid: member.uid,
      name: member.name,
      email: member.email,
      role: member.role,
      currentCompany: member.currentCompany,
      jobSearchStatus: member.jobSearchStatus,
      bio: member.bio,
      githubHandler: member.githubHandler,
      linkedinHandler: member.linkedinHandler,
      location: member.location,
      skills: member.skills,
      experiences: member.experiences,
      projectContributions: member.projectContributions,
      teamMemberRoles: member.teamMemberRoles,
    };
  }

  private async resolveApplicationRecipients(jobOpening: ResolvedJobOpening) {
    if (jobOpening.team.hasInactiveLeadEmails) {
      throw new BadRequestException('This job is not accepting in-app applications');
    }
    if (isProtocolLabsTeam({ teamUid: jobOpening.team.uid, name: jobOpening.team.name })) {
      const jobReferEmail = jobOpening.team.jobReferEmail?.trim() || null;
      if (!jobReferEmail) {
        throw new BadRequestException('This job is not accepting in-app applications');
      }
      const toKey = jobReferEmail.toLowerCase();
      const cc = parseJobReferCcEmails(jobOpening.team.jobReferCcEmails)
        .filter((email) => email !== toKey)
        .map((email) => ({ uid: jobOpening.team.uid, name: jobOpening.team.name, email }));
      return {
        to: { uid: jobOpening.team.uid, name: jobOpening.team.name, email: jobReferEmail },
        cc,
      };
    }

    const leads = await this.resolveTeamLeads(jobOpening.team.uid);
    return this.buildToAndCc(leads);
  }

  private async resolveTeamLeads(teamUid: string): Promise<Array<{ uid: string; name: string; email: string }>> {
    const roles = await this.prisma.teamMemberRole.findMany({
      where: {
        teamUid,
        teamLead: true,
        member: { deletedAt: null, email: { not: null }, hasInactiveEmail: false },
      },
      select: {
        member: { select: { uid: true, name: true, email: true } },
      },
    });

    const leads = roles
      .map((role) => role.member)
      .filter((member): member is { uid: string; name: string; email: string } => Boolean(member.email));

    if (leads.length === 0) {
      throw new BadRequestException('This job has no team leads with email addresses');
    }
    return leads;
  }

  private buildToAndCc(leads: Array<{ uid: string; name: string; email: string }>) {
    const seen = new Set<string>();
    const unique: Array<{ uid: string; name: string; email: string }> = [];
    for (const lead of leads) {
      const key = lead.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(lead);
    }
    const [to, ...cc] = unique;
    return { to, cc };
  }

  private resolveHeadline(applicant: Applicant): MemberHeadline {
    const teamRole = applicant.teamMemberRoles.find((role) => role.mainTeam) ?? applicant.teamMemberRoles[0];
    if (teamRole) {
      return { title: teamRole.role ?? applicant.role?.trim() ?? null, companyName: teamRole.team.name };
    }
    return { title: applicant.role?.trim() ?? null, companyName: applicant.currentCompany?.trim() || null };
  }

  private formatHeadline(headline: MemberHeadline): string | null {
    if (headline.title && headline.companyName) return `${headline.title}, ${headline.companyName}`;
    return headline.title ?? null;
  }

  private formatLocation(location: ApplicantLocation): string | null {
    if (!location) return null;
    return [location.city, location.country].filter(Boolean).join(', ') || null;
  }

  // Shape consumed by the `memberCard` partial in the JOB_BOARD_APPLICATION_EMAIL template.
  private buildMemberCard(applicant: Applicant, jobUid: string) {
    return {
      name: applicant.name,
      profileUrl: memberProfileEmailUrl(applicant.uid, {
        source: JOB_APPLICATION_EMAIL_UTM_SOURCE,
        content: 'applicant',
        jobUid,
      }),
      headline: this.formatHeadline(this.resolveHeadline(applicant)),
      location: this.formatLocation(applicant.location),
      skills: applicant.skills
        .map((skill) => skill.title)
        .filter(Boolean)
        .slice(0, PROFILE_CARD_SKILLS_LIMIT),
    };
  }

  private resolveCompanyName(applicant: Applicant): string | null {
    if (applicant.currentCompany?.trim()) {
      return applicant.currentCompany.trim();
    }
    const mainTeam = applicant.teamMemberRoles.find((role) => role.mainTeam) ?? applicant.teamMemberRoles[0];
    return mainTeam?.team.name ?? null;
  }

  private buildProfileSnapshot(applicant: Applicant) {
    return {
      memberUid: applicant.uid,
      name: applicant.name,
      email: applicant.email,
      role: applicant.role?.trim() ?? '',
      currentCompany: this.resolveCompanyName(applicant),
      location: applicant.location
        ? {
            city: applicant.location.city ?? undefined,
            country: applicant.location.country,
            region: applicant.location.region ?? undefined,
          }
        : null,
      skills: applicant.skills.map((skill) => skill.title),
      bio: applicant.bio,
      githubHandler: applicant.githubHandler,
      linkedinHandler: applicant.linkedinHandler,
      experiences: applicant.experiences.map((experience) => ({
        title: experience.title,
        company: experience.company,
        location: experience.location,
        startDate: experience.startDate.toISOString(),
        endDate: experience.endDate ? experience.endDate.toISOString() : null,
        isCurrent: experience.isCurrent,
        description: experience.description,
      })),
      contributions: applicant.projectContributions.map((contribution) => ({
        projectName: contribution.project?.name ?? null,
        role: contribution.role,
        startDate: contribution.startDate ? contribution.startDate.toISOString() : null,
        endDate: contribution.endDate ? contribution.endDate.toISOString() : null,
        currentProject: contribution.currentProject,
        description: contribution.description,
      })),
      profileUrl: `${process.env.WEB_UI_BASE_URL}/members/${applicant.uid}`,
    };
  }
}
