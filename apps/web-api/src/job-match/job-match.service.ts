import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { jobBoardDetailUrl, memberProfileUrl } from '../job-openings/job-openings-url';
import { MembersService } from '../members/members.service';
import { PrismaService } from '../shared/prisma.service';
import { AwsService } from '../utils/aws/aws.service';
import { maskEmail } from '../utils/mask-email';
import { renderCandidateIntroEmail, type RenderedEmail } from './emails/candidate-intro-email';
import { listRunSuggestions } from './job-match-suggestions';
import {
  MATCH_JOB_SELECT,
  asMarkedCriteria,
  asStringList,
  currentRoleTextHash,
  flaggedCriteria,
  isLiveOpening,
  labelText,
  type MatchJob,
} from './job-match.logic';

export type SuggestedCandidate = {
  memberUid: string;
  name: string;
  role: string | null;
  imageUrl: string | null;
  fit: number;
  label: 'Strong match' | 'Good match';
  rank: number;
  blurb: string | null;
  criteria: { text: string; matched: boolean }[];
  /** The member said they are interested in this role or in its team, as of the stored run (LAB-2788). */
  interested: boolean;
  /** The note the member wrote with that interest, as of the stored run; null when not interested (LAB-2802). */
  note: string | null;
  /** When the role's team contacted this member about this role through the Directory; null when it has not (LAB-2846). */
  contactedAt: string | null;
};

export type MatchCriterionView = { text: string; enabled: boolean };

type RoleJob = MatchJob & { teamUid: string | null; status: string; publishedAt: Date | null };

type ActingMember = NonNullable<Awaited<ReturnType<MembersService['findMemberByEmail']>>>;

const ACT_FORBIDDEN = 'Only team leads and directory admins can act on suggested candidates';

@Injectable()
export class JobMatchService {
  private readonly logger = new Logger(JobMatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly membersService: MembersService,
    private readonly awsService: AwsService
  ) {}

  async listForRole(
    roleUid: string,
    userEmail: string | undefined
  ): Promise<{ suggestions: SuggestedCandidate[]; criteria: MatchCriterionView[] }> {
    if (!userEmail) {
      throw new ForbiddenException('Only hiring team members and directory admins can read suggested candidates');
    }
    const member = await this.membersService.findMemberByEmail(userEmail);
    if (!member) {
      throw new ForbiddenException('Only hiring team members and directory admins can read suggested candidates');
    }

    const job = await this.loadJob(roleUid);

    const allowed =
      member.isDirectoryAdmin || (job.teamUid ? await this.isCurrentMember(job.teamUid, member.uid) : false);
    if (!allowed) {
      throw new ForbiddenException('Only hiring team members and directory admins can read suggested candidates');
    }
    if (!isLiveOpening(job)) return { suggestions: [], criteria: [] };

    const stored = await this.storedSuggestions(roleUid);
    const contacts = stored.length
      ? await this.prisma.jobMatchContact.findMany({
          where: { roleUid, memberUid: { in: stored.map(({ row }) => row.memberUid) } },
          select: { memberUid: true, createdAt: true },
        })
      : [];
    const contactedAt = new Map(contacts.map((contact) => [contact.memberUid, contact.createdAt.toISOString()]));

    const suggestions = stored.map(({ row, person, fit, rank, label }) => ({
      memberUid: row.memberUid,
      name: person.name,
      role: person.role,
      imageUrl: person.image?.url ?? null,
      fit,
      label: labelText(label),
      rank,
      blurb: row.blurb,
      criteria: asMarkedCriteria(row.payload),
      interested: row.interested === true,
      note: row.interested === true ? row.interestNote ?? null : null,
      contactedAt: contactedAt.get(row.memberUid) ?? null,
    }));

    const { hash, all } = await this.currentCriteria(job);
    const criteria = all.length ? flaggedCriteria(all, await this.disabledCriteria(roleUid, hash)) : [];
    return { suggestions, criteria };
  }

  /**
   * Replaces the disabled criteria of the role's current posting (LAB-2846). Takes effect from the next match
   * run; nothing is re-scored here. Not gated on the role being live: a lead may tune a paused role.
   */
  async updateCriteria(
    roleUid: string,
    disabled: string[],
    userEmail: string | undefined
  ): Promise<{ criteria: MatchCriterionView[] }> {
    const job = await this.loadJob(roleUid);
    const member = await this.assertCanAct(job, userEmail);

    const { hash, all } = await this.currentCriteria(job);
    if (!all.length) {
      throw new ConflictException('No match criteria have been extracted for this role yet');
    }
    const normalized = [...new Set(disabled.map((text) => text.trim()))];
    const unknown = normalized.filter((text) => !all.includes(text));
    if (unknown.length) {
      throw new BadRequestException(`Not a criterion of this role: ${unknown.join(', ')}`);
    }
    if (all.every((text) => normalized.includes(text))) {
      throw new BadRequestException('At least one criterion must stay enabled');
    }

    await this.prisma.jobMatchCriteriaOverride.upsert({
      where: { roleUid_roleTextHash: { roleUid, roleTextHash: hash } },
      create: { roleUid, roleTextHash: hash, disabled: normalized, updatedByUid: member.uid },
      update: { disabled: normalized, updatedByUid: member.uid },
    });
    return { criteria: flaggedCriteria(all, normalized) };
  }

  /**
   * Records a lead's contact with a suggested candidate and sends the intro email (LAB-2846).
   * The row is inserted first so the unique (role, member) index stops a second send, and deleted again
   * when the send fails so the lead can retry.
   */
  async contactCandidate(
    roleUid: string,
    memberUid: string,
    message: string,
    userEmail: string | undefined
  ): Promise<{ contactedAt: string }> {
    const job = await this.loadJob(roleUid);
    const lead = await this.assertCanAct(job, userEmail);

    if (!isLiveOpening(job) || !job.teamUid) {
      throw new NotFoundException('This member is not a current suggestion for this role');
    }
    const suggested = await this.storedSuggestions(roleUid);
    if (!suggested.some(({ row }) => row.memberUid === memberUid)) {
      throw new NotFoundException('This member is not a current suggestion for this role');
    }
    const candidate = await this.prisma.member.findUnique({ where: { uid: memberUid }, select: { email: true } });
    if (!candidate?.email) {
      throw new BadRequestException('This candidate has no email address');
    }
    const team = await this.prisma.team.findUnique({ where: { uid: job.teamUid }, select: { name: true } });

    const email = renderCandidateIntroEmail({
      leadName: lead.name,
      leadEmail: lead.email ?? '',
      roleTitle: job.roleTitle,
      teamName: team?.name ?? job.companyName,
      message,
      roleUrl: jobBoardDetailUrl(roleUid),
      leadProfileUrl: memberProfileUrl(lead.uid),
    });

    let contact: { uid: string; createdAt: Date };
    try {
      contact = await this.prisma.jobMatchContact.create({
        data: { roleUid, memberUid, senderUid: lead.uid, message },
        select: { uid: true, createdAt: true },
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new ConflictException('This candidate was already contacted about this role');
      }
      throw error;
    }

    const from = process.env.SES_SOURCE_EMAIL ?? '';
    const replyTo = lead.email ?? undefined;
    if (!this.awsService.isEmailServiceEnabled()) {
      this.previewToConsole(email, from, candidate.email, replyTo);
      return { contactedAt: contact.createdAt.toISOString() };
    }
    try {
      await this.awsService.sendHtmlEmail({
        from,
        to: [candidate.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo,
      });
    } catch (error) {
      this.logger.error(
        `candidate intro email for role ${roleUid} member ${memberUid} failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      await this.prisma.jobMatchContact.delete({ where: { uid: contact.uid } }).catch((deleteError) => {
        this.logger.error(`could not delete contact ${contact.uid} after a failed send: ${String(deleteError)}`);
      });
      throw new InternalServerErrorException('The intro email could not be sent');
    }
    return { contactedAt: contact.createdAt.toISOString() };
  }

  /** A directory admin, else a current lead of the role's team; a role without a team is admin-only. */
  async assertCanAct(job: { teamUid: string | null }, userEmail: string | undefined): Promise<ActingMember> {
    if (!userEmail) throw new ForbiddenException(ACT_FORBIDDEN);
    const member = await this.membersService.findMemberByEmail(userEmail);
    if (!member) throw new ForbiddenException(ACT_FORBIDDEN);
    if (member.isDirectoryAdmin) return member;
    if (job.teamUid && (await this.isCurrentTeamLead(job.teamUid, member.uid))) return member;
    throw new ForbiddenException(ACT_FORBIDDEN);
  }

  /** How many suggestions the Suggested tab lists for each live role; roles with none are absent. */
  async suggestedCounts(
    jobs: { uid: string; teamUid: string | null; status: string; publishedAt: Date | null }[]
  ): Promise<Map<string, number>> {
    const liveUids = jobs.filter(isLiveOpening).map((job) => job.uid);
    const lists = await Promise.all(liveUids.map((uid) => this.storedSuggestions(uid)));
    const counts = new Map<string, number>();
    liveUids.forEach((uid, index) => {
      if (lists[index].length > 0) counts.set(uid, lists[index].length);
    });
    return counts;
  }

  private async loadJob(roleUid: string): Promise<RoleJob> {
    const job = await this.prisma.jobOpening.findUnique({
      where: { uid: roleUid },
      select: { ...MATCH_JOB_SELECT, teamUid: true, status: true, publishedAt: true },
    });
    if (!job) throw new NotFoundException('Job opening not found');
    return job;
  }

  /** The criteria extracted for the role's current posting, read the way the runner reads them. */
  private async currentCriteria(job: MatchJob): Promise<{ hash: string; all: string[] }> {
    const hash = currentRoleTextHash(job);
    const row = await this.prisma.jobMatchRow.findFirst({
      where: { kind: 'CRITERIA', roleUid: job.uid, roleTextHash: hash },
      orderBy: { createdAt: 'desc' },
      select: { payload: true },
    });
    return { hash, all: asStringList(row?.payload).slice(0, 6) };
  }

  private async disabledCriteria(roleUid: string, hash: string): Promise<string[]> {
    const override = await this.prisma.jobMatchCriteriaOverride.findUnique({
      where: { roleUid_roleTextHash: { roleUid, roleTextHash: hash } },
      select: { disabled: true },
    });
    return override?.disabled ?? [];
  }

  private previewToConsole(email: RenderedEmail, from: string, to: string, replyTo: string | undefined) {
    try {
      const previewPath = path.join(os.tmpdir(), `candidate-intro-${Date.now()}.html`);
      fs.writeFileSync(previewPath, email.html, 'utf-8');
      this.logger.log(
        '\n────── EMAIL PREVIEW (IS_EMAIL_ENABLED is not true) ──────\n' +
          `  From:     ${from}\n` +
          `  To:       ${maskEmail(to)}\n` +
          `  Reply-To: ${replyTo ?? '—'}\n` +
          `  Subject:  ${email.subject}\n` +
          `  Preview:  file://${previewPath}\n` +
          '─────────────────────────────────────────────────────────'
      );
    } catch (error) {
      this.logger.error(`Failed to write email preview: ${(error as Error).message}`);
    }
  }

  private async storedSuggestions(roleUid: string) {
    const latest = await this.prisma.jobMatchRow.findFirst({
      where: { kind: 'ROLE', roleUid },
      orderBy: { createdAt: 'desc' },
      select: { runUid: true },
    });
    if (!latest) return [];
    return listRunSuggestions(this.prisma, latest.runUid, roleUid);
  }

  /** A team lead whose role on the team has not ended (LAB-2846; the same rule LAB-2850 lists leads by). */
  private async isCurrentTeamLead(teamUid: string, memberUid: string): Promise<boolean> {
    const role = await this.prisma.teamMemberRole.findFirst({
      where: {
        teamUid,
        memberUid,
        teamLead: true,
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      select: { id: true },
    });
    return Boolean(role);
  }

  private async isCurrentMember(teamUid: string, memberUid: string): Promise<boolean> {
    const role = await this.prisma.teamMemberRole.findFirst({
      where: {
        teamUid,
        memberUid,
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      select: { id: true },
    });
    return Boolean(role);
  }
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002';
}
