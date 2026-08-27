import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MemberApprovalState, Prisma } from '@prisma/client';
import type { CreateJobApplicationInput } from 'libs/contracts/src/schema/job-application';
import { PrismaService } from '../shared/prisma.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { noteToHtml } from './job-openings-email-html';
import { resolveVisibleJobOpening, type ResolvedJobOpening } from './job-openings-resolve';
import { isProtocolLabsTeam } from './pin-protocol-labs-team';
import { jobBoardDetailUrl } from './job-openings-url';

const JOB_BOARD_APPLICATION_TEMPLATE = 'JOB_BOARD_APPLICATION_EMAIL';

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
  approvalState: MemberApprovalState | null;
  location: { city: string | null; country: string; region: string | null } | null;
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
  teamMemberRoles: Array<{ mainTeam: boolean; team: { name: string } }>;
};

@Injectable()
export class JobOpeningsApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationServiceClient: NotificationServiceClient
  ) {}

  async apply(jobUid: string, applicantEmail: string | undefined, input: CreateJobApplicationInput) {
    const applicant = await this.resolveApplicant(applicantEmail);
    this.assertCanApply(applicant);

    const existing = await this.prisma.jobApplication.findUnique({
      where: { jobOpeningUid_memberUid: { jobOpeningUid: jobUid, memberUid: applicant.uid } },
      select: { uid: true },
    });
    if (existing) {
      throw new ConflictException('Already applied to this job');
    }

    const jobOpening = await resolveVisibleJobOpening(this.prisma, jobUid);
    const { to, cc } = await this.resolveApplicationRecipients(jobOpening);

    const companyName = this.resolveCompanyName(applicant);
    const profileSnapshot = this.buildProfileSnapshot(applicant, companyName);
    const coverLetterHtml = noteToHtml(input.coverLetter);
    const primaryExperience = this.primaryExperience(applicant.experiences);
    const webBase = (process.env.WEB_UI_BASE_URL || '').replace(/\/+$/, '');

    await this.notificationServiceClient.sendNotification({
      isPriority: true,
      deliveryChannel: 'EMAIL',
      templateName: JOB_BOARD_APPLICATION_TEMPLATE,
      recipientsInfo: {
        to: [to.email],
        cc: cc.map((lead) => lead.email),
        replyTo: applicant.email,
      },
      deliveryPayload: {
        body: {
          applicantName: applicant.name,
          applicantFirstName: this.firstName(applicant.name),
          applicantRole: applicant.role?.trim() ?? '',
          applicantCompany: primaryExperience?.company.trim() || companyName || '',
          applicantWorkDuration: primaryExperience ? this.formatExperienceDates(primaryExperience) : '',
          applicantLocation: this.formatLocation(applicant.location),
          applicantSkills: applicant.skills.map((skill) => skill.title).filter(Boolean),
          roleTitle: jobOpening.roleTitle,
          teamName: jobOpening.team.name,
          coverLetterHtml,
          profileUrl: `${webBase}/members/${applicant.uid}`,
          applyUrl: jobBoardDetailUrl(jobOpening.uid),
          preferencesUrl: `${webBase}/settings/email`,
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

    try {
      const record = await this.prisma.jobApplication.create({
        data: {
          jobOpeningUid: jobOpening.uid,
          memberUid: applicant.uid,
          coverLetter: input.coverLetter.trim(),
          profileSnapshot,
          toEmail: to.email,
          ccEmails: cc.map((lead) => lead.email),
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
    const member = await this.prisma.member.findUnique({
      where: { email },
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
        memberApproval: { select: { state: true } },
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
          select: { mainTeam: true, team: { select: { name: true } } },
        },
      },
    });
    if (!member || member.deletedAt || !member.email) {
      throw new UnauthorizedException('Member not found');
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
      approvalState: member.memberApproval?.state ?? null,
      location: member.location,
      skills: member.skills,
      experiences: member.experiences,
      projectContributions: member.projectContributions,
      teamMemberRoles: member.teamMemberRoles,
    };
  }

  private assertCanApply(applicant: Applicant) {
    if (applicant.approvalState !== MemberApprovalState.APPROVED) {
      throw new ForbiddenException('Account must be approved before applying');
    }
    if (!applicant.role?.trim()) {
      throw new BadRequestException('Current role is required before applying');
    }
    if (!applicant.jobSearchStatus) {
      throw new BadRequestException('Job search status is required before applying');
    }
  }

  private async resolveApplicationRecipients(jobOpening: ResolvedJobOpening) {
    if (isProtocolLabsTeam({ teamUid: jobOpening.team.uid, name: jobOpening.team.name })) {
      const jobReferEmail = jobOpening.team.jobReferEmail?.trim() || null;
      if (!jobReferEmail) {
        throw new BadRequestException('This job is not accepting in-app applications');
      }
      return {
        to: { uid: jobOpening.team.uid, name: jobOpening.team.name, email: jobReferEmail },
        cc: [] as Array<{ uid: string; name: string; email: string }>,
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
        member: { deletedAt: null, email: { not: null } },
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

  private firstName(name: string) {
    return name.trim().split(/\s+/)[0] || name;
  }

  private primaryExperience(experiences: Applicant['experiences']) {
    const current = experiences.find((experience) => experience.isCurrent);
    if (current) return current;
    return [...experiences].sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0] ?? null;
  }

  private formatExperienceDates(experience: Applicant['experiences'][number]) {
    const start = this.formatMonthYear(experience.startDate);
    const end = experience.isCurrent || !experience.endDate ? 'Present' : this.formatMonthYear(experience.endDate);
    return [start, end].filter(Boolean).join(' — ');
  }

  private formatMonthYear(date: Date) {
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  }

  private formatLocation(location: Applicant['location']) {
    if (!location) return '';
    return [location.city, location.country].filter(Boolean).join(', ');
  }

  private resolveCompanyName(applicant: Applicant): string | null {
    if (applicant.currentCompany?.trim()) {
      return applicant.currentCompany.trim();
    }
    const mainTeam = applicant.teamMemberRoles.find((role) => role.mainTeam) ?? applicant.teamMemberRoles[0];
    return mainTeam?.team.name ?? null;
  }

  private buildProfileSnapshot(applicant: Applicant, companyName: string | null) {
    return {
      memberUid: applicant.uid,
      name: applicant.name,
      email: applicant.email,
      role: applicant.role?.trim() ?? '',
      currentCompany: companyName,
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
