import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { webUiBase } from '../job-openings/job-openings-url';
import { SuggestedCandidatesEmailPreferenceService } from '../notification-settings/suggested-candidates-email-preference.service';
import { PrismaService } from '../shared/prisma.service';
import { AwsService } from '../utils/aws/aws.service';
import { maskEmail } from '../utils/mask-email';
import type { RenderedEmail } from './emails/candidate-intro-email';
import {
  renderSuggestedCandidatesEmail,
  type SuggestedCandidatesEmailCandidate,
  type SuggestedCandidatesEmailInput,
} from './emails/suggested-candidates-email';
import { trackSuggestedCandidatesEmailSent } from './job-match-analytics';
import {
  currentRoleCriteria,
  listRunSuggestions,
  suggestionCriteria,
  type ListedSuggestion,
} from './job-match-suggestions';
import { JOB_MATCH_RUN_COMPLETED, type JobMatchRunCompletedPayload } from './job-match.events';
import type { JobMatchEmailKind } from '@prisma/client';
import {
  MATCH_JOB_SELECT,
  isEmailDryRun,
  isLiveOpening,
  labelText,
  isEmailTeamAllowed,
  parseEmailTeamAllowlist,
  pickTeamSuggestedEmail,
  type MatchCriterionItem,
  type MatchJob,
  type SuggestedEmailKind,
  type TeamEmailPick,
  type TeamEmailRole,
} from './job-match.logic';
import {
  hasSuggestedCandidatesTokenSecret,
  issueSuggestedCandidatesUnsubscribeToken,
} from './suggested-candidates-token.util';

export type SuggestedCandidatesSendResult = {
  runUid: string;
  dryRun: boolean;
  /** Emails sent through SES; in a dry run or with IS_EMAIL_ENABLED off, the emails logged or previewed instead. */
  sent: number;
  /** Leads of roles with suggestions who got no email: opted out, already emailed for the run, or failed. */
  skipped: number;
};

const DB_KIND: Record<SuggestedEmailKind, JobMatchEmailKind> = { first: 'FIRST', new: 'NEW', reminder: 'REMINDER' };
const EMAIL_KIND: Record<JobMatchEmailKind, SuggestedEmailKind> = { FIRST: 'first', NEW: 'new', REMINDER: 'reminder' };

type Lead = { uid: string; name: string; email: string };

type RoleItem = ListedSuggestion & { memberUid: string };
type EmailJob = MatchJob & { teamUid: string | null; publishedAt: Date | null };
type RoleData = { job: EmailJob; items: RoleItem[] };

type Mode = 'dry-run' | 'preview' | 'send';

/**
 * The weekly suggested-candidates email to team leads (LAB-2850). Runs after a full job-match run completes
 * (event) or on demand (service route). Gates, in order: team allowlist, live role on an allowlisted team, listed
 * suggestions, lead opted in and not already emailed for the run, an email to send (`pickSuggestedEmail`: first,
 * new or a one-off reminder, judged against what this lead was already emailed for the role), dry run,
 * IS_EMAIL_ENABLED.
 */
@Injectable()
export class SuggestedCandidatesEmailService {
  private readonly logger = new Logger(SuggestedCandidatesEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly awsService: AwsService,
    private readonly preference: SuggestedCandidatesEmailPreferenceService,
    private readonly analytics: AnalyticsService
  ) {}

  /** Never rethrows: an email failure must not reach the runner (whose run is already COMPLETED). */
  @OnEvent(JOB_MATCH_RUN_COMPLETED, { async: true })
  async onRunCompleted(payload: JobMatchRunCompletedPayload): Promise<void> {
    try {
      await this.sendForRun(payload.runUid);
    } catch (error) {
      this.logger.error(`suggested-candidates email for run ${payload.runUid} failed: ${errorText(error)}`);
    }
  }

  /** The run to send for: the given one if it is COMPLETED, else the latest COMPLETED run; null when none. */
  async completedRun(runUid?: string): Promise<{ uid: string } | null> {
    if (runUid) {
      // FEATURE-ENV ONLY (never merge): a team-scoped run never becomes COMPLETED, it only drops its lock when it
      // finishes. On a feature env (the email guard is configured) accept such a finished run so the email can be
      // tested end to end on one team.
      if (process.env.FEATURE_ENV_EMAIL_ALLOWLIST !== undefined) {
        return this.prisma.jobMatchRun.findFirst({
          where: {
            uid: runUid,
            OR: [
              { status: 'COMPLETED' },
              { status: 'RUNNING', OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date() } }] },
            ],
          },
          select: { uid: true },
        });
      }
      return this.prisma.jobMatchRun.findFirst({ where: { uid: runUid, status: 'COMPLETED' }, select: { uid: true } });
    }
    return this.prisma.jobMatchRun.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { runDate: 'desc' },
      select: { uid: true },
    });
  }

  async sendForRun(runUid: string): Promise<SuggestedCandidatesSendResult> {
    const dryRun = isEmailDryRun(process.env.JOB_MATCH_EMAIL_DRY_RUN);
    const result: SuggestedCandidatesSendResult = { runUid, dryRun, sent: 0, skipped: 0 };

    const allowlist = parseEmailTeamAllowlist(process.env.JOB_MATCH_EMAIL_TEAM_UIDS);
    if (!allowlist.size) {
      this.logger.log('suggested-candidates email: no allowlisted teams');
      return result;
    }
    if (!dryRun && !hasSuggestedCandidatesTokenSecret()) {
      // No email goes out without a working unsubscribe link.
      throw new Error('SUGGESTED_CANDIDATES_TOKEN_SECRET is not set; suggested-candidates email aborted');
    }
    const mode: Mode = dryRun ? 'dry-run' : this.awsService.isEmailServiceEnabled() ? 'send' : 'preview';
    const baseUrl = mode === 'dry-run' ? '' : webUiBase();

    const roleRows = await this.prisma.jobMatchRow.findMany({
      where: { kind: 'ROLE', runUid },
      select: { roleUid: true },
    });
    const jobs = roleRows.length
      ? await this.prisma.jobOpening.findMany({
          where: { uid: { in: roleRows.map((row) => row.roleUid) } },
          select: { ...MATCH_JOB_SELECT, teamUid: true, status: true, publishedAt: true },
        })
      : [];

    // One email per team (LAB-3139): the team's live roles from this run, grouped.
    const byTeam = new Map<string, EmailJob[]>();
    for (const job of jobs) {
      if (!isLiveOpening(job) || !job.teamUid || !isEmailTeamAllowed(allowlist, job.teamUid)) continue;
      byTeam.set(job.teamUid, [...(byTeam.get(job.teamUid) ?? []), job]);
    }

    for (const [teamUid, teamJobs] of byTeam) {
      const roles: RoleData[] = [];
      for (const job of teamJobs) {
        const listed = await listRunSuggestions(this.prisma, runUid, job.uid);
        if (listed.length)
          roles.push({ job, items: listed.map((item) => ({ ...item, memberUid: item.row.memberUid })) });
      }
      if (!roles.length) continue;

      const team = await this.loadTeam(teamUid);
      if (!team.leads.length) continue;

      const optedIn = await this.preference.enabledFor(team.leads.map((lead) => lead.uid));
      // Every lead's earlier emails for the team, newest first: this run's claims and the history `pick` reads.
      const sentForTeam = await this.prisma.jobMatchEmailSend.findMany({
        where: { teamUid },
        orderBy: { sentAt: 'desc' },
        select: { runUid: true, roleUid: true, recipientUid: true, kind: true, memberUids: true },
      });
      const notLooking = await this.notLookingUids([
        ...new Set(roles.flatMap((role) => role.items.map((item) => item.memberUid))),
      ]);
      // Read once per role and only when needed.
      const contacted = new Map<string, Set<string>>();
      const criteria = new Map<string, MatchCriterionItem[]>();
      const applied = new Map<string, Set<string>>();

      for (const lead of team.leads) {
        const mine = sentForTeam.filter((send) => send.recipientUid === lead.uid);
        if (!optedIn.has(lead.uid) || mine.some((send) => send.runUid === runUid)) {
          result.skipped++;
          continue;
        }
        const teamRoles: TeamEmailRole<RoleItem>[] = [];
        for (const role of roles) {
          if (!contacted.has(role.job.uid)) {
            contacted.set(
              role.job.uid,
              await this.contactedUids(
                role.job.uid,
                role.items.map((item) => item.memberUid)
              )
            );
          }
          teamRoles.push({
            roleUid: role.job.uid,
            publishedAt: role.job.publishedAt ?? null,
            listed: role.items,
            // A row from before kinds existed names nobody, so it is not history.
            history: mine
              .filter((send) => send.roleUid === role.job.uid && send.memberUids.length > 0)
              .map((send) => ({ kind: EMAIL_KIND[send.kind], memberUids: send.memberUids })),
            contacted: contacted.get(role.job.uid) ?? new Set(),
          });
        }
        const pick = pickTeamSuggestedEmail({
          roles: teamRoles,
          notLooking,
          lastKind: mine.length ? EMAIL_KIND[mine[0].kind] : null,
        });
        if (!pick) continue;

        const jobOf = (roleUid: string) => roles.find((role) => role.job.uid === roleUid)?.job as EmailJob;
        if (mode === 'dry-run') {
          this.logger.log(
            `DRY RUN would email ${lead.uid} ${lead.email} about team ${teamUid}: ${pick.kind}, ${pick.sections
              .map(
                (section) =>
                  `"${jobOf(section.roleUid).roleTitle}" ${section.cards.length} of ${section.matches.length}`
              )
              .join(', ')}`
          );
          result.sent++;
          continue;
        }

        for (const section of pick.sections) {
          const job = jobOf(section.roleUid);
          if (!criteria.has(job.uid)) criteria.set(job.uid, (await currentRoleCriteria(this.prisma, job)).all);
          if (!applied.has(job.uid)) {
            applied.set(
              job.uid,
              await this.appliedUids(
                job.uid,
                section.matches.map((item) => item.memberUid)
              )
            );
          }
        }
        const email = renderSuggestedCandidatesEmail(
          emailInput({
            lead,
            teamUid,
            teamName: team.name ?? jobOf(pick.sections[0].roleUid).companyName,
            pick,
            jobOf,
            criteria,
            applied,
            baseUrl,
          })
        );
        if (mode === 'preview') {
          this.preview(email, lead, teamUid);
          result.sent++;
          continue;
        }
        const delivered = await this.claimAndSend(email, lead, {
          runUid,
          teamUid,
          kind: DB_KIND[pick.kind],
          sections: pick.sections.map((section) => ({
            roleUid: section.roleUid,
            memberUids: section.matches.map((item) => item.memberUid),
          })),
        });
        if (delivered) result.sent++;
        else result.skipped++;
      }
    }

    this.logger.log(
      `suggested-candidates email done: run ${runUid} ${mode} sent ${result.sent} skipped ${result.skipped}`
    );
    return result;
  }

  /**
   * Claim first, one row per role the email covers, so two overlapping sends cannot both email the lead; drop the
   * claims again when SES fails. Only a delivered email is tracked (`suggested-candidates-email-sent`); dry runs and
   * previews never get here.
   */
  private async claimAndSend(
    email: RenderedEmail,
    lead: Lead,
    claim: {
      runUid: string;
      teamUid: string;
      kind: JobMatchEmailKind;
      sections: { roleUid: string; memberUids: string[] }[];
    }
  ): Promise<boolean> {
    let claimUids: string[];
    try {
      const rows = await this.prisma.$transaction(
        claim.sections.map((section) =>
          this.prisma.jobMatchEmailSend.create({
            data: {
              runUid: claim.runUid,
              roleUid: section.roleUid,
              teamUid: claim.teamUid,
              recipientUid: lead.uid,
              kind: claim.kind,
              memberUids: section.memberUids,
              candidateCount: section.memberUids.length,
            },
            select: { uid: true },
          })
        )
      );
      claimUids = rows.map((row) => row.uid);
    } catch (error) {
      if (isUniqueConflict(error)) return false;
      throw error;
    }
    try {
      await this.awsService.sendHtmlEmail({
        from: process.env.SES_SOURCE_EMAIL || 'no-reply@plnetwork.io',
        to: [lead.email],
        bcc: process.env.LABOS_EMAIL ? [process.env.LABOS_EMAIL] : [],
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (error) {
      this.logger.error(
        `suggested-candidates email to ${lead.uid} for team ${claim.teamUid} failed: ${errorText(error)}`
      );
      await this.prisma.jobMatchEmailSend.deleteMany({ where: { uid: { in: claimUids } } }).catch((deleteError) => {
        this.logger.error(
          `could not delete email claims ${claimUids.join(', ')} after a failed send: ${errorText(deleteError)}`
        );
      });
      return false;
    }
    trackSuggestedCandidatesEmailSent(this.analytics, this.logger, {
      recipientUid: lead.uid,
      runUid: claim.runUid,
      teamUid: claim.teamUid,
      roleUids: claim.sections.map((section) => section.roleUid),
      kind: EMAIL_KIND[claim.kind],
      candidateCount: new Set(claim.sections.flatMap((section) => section.memberUids)).size,
    });
    return true;
  }

  /** Who has applied to the role, among `memberUids` (LAB-3139: "N have applied"). */
  private async appliedUids(roleUid: string, memberUids: string[]): Promise<Set<string>> {
    if (!memberUids.length) return new Set();
    const rows = await this.prisma.jobApplication.findMany({
      where: { jobOpeningUid: roleUid, memberUid: { in: memberUids } },
      select: { memberUid: true },
    });
    return new Set(rows.map((row) => row.memberUid));
  }

  /** Who a lead of the team has already contacted about the role, among `memberUids` (LAB-2847). */
  private async contactedUids(roleUid: string, memberUids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.jobMatchContact.findMany({
      where: { roleUid, memberUid: { in: memberUids } },
      select: { memberUid: true },
    });
    return new Set(rows.map((row) => row.memberUid));
  }

  private async notLookingUids(memberUids: string[]): Promise<Set<string>> {
    const members = await this.prisma.member.findMany({
      where: { uid: { in: memberUids }, jobSearchStatus: 'NOT_LOOKING' },
      select: { uid: true },
    });
    return new Set(members.map((member) => member.uid));
  }

  /** Current leads: lead flag set, membership not ended, member not deleted and with an email. */
  private async loadTeam(teamUid: string): Promise<{ name: string | null; leads: Lead[] }> {
    const team = await this.prisma.team.findUnique({ where: { uid: teamUid }, select: { name: true } });
    const roles = await this.prisma.teamMemberRole.findMany({
      where: {
        teamUid,
        teamLead: true,
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        member: { deletedAt: null, email: { not: null } },
      },
      select: { member: { select: { uid: true, name: true, email: true } } },
    });
    const leads = new Map<string, Lead>();
    for (const { member } of roles) {
      if (member.email) leads.set(member.uid, { uid: member.uid, name: member.name, email: member.email });
    }
    return { name: team?.name ?? null, leads: [...leads.values()] };
  }

  private preview(email: RenderedEmail, lead: Lead, teamUid: string) {
    try {
      const previewPath = path.join(os.tmpdir(), `suggested-candidates-${teamUid}-${lead.uid}-${Date.now()}.html`);
      fs.writeFileSync(previewPath, email.html, 'utf-8');
      this.logger.log(
        '\n────── EMAIL PREVIEW (IS_EMAIL_ENABLED is not true) ──────\n' +
          `  To:       ${maskEmail(lead.email)}\n` +
          `  Subject:  ${email.subject}\n` +
          `  Preview:  file://${previewPath}\n` +
          '─────────────────────────────────────────────────────────'
      );
    } catch (error) {
      this.logger.error(`Failed to write email preview: ${errorText(error)}`);
    }
  }
}

function emailInput(args: {
  lead: Lead;
  teamUid: string;
  teamName: string;
  pick: TeamEmailPick<RoleItem>;
  jobOf: (roleUid: string) => EmailJob;
  criteria: ReadonlyMap<string, readonly MatchCriterionItem[]>;
  applied: ReadonlyMap<string, ReadonlySet<string>>;
  baseUrl: string;
}): SuggestedCandidatesEmailInput {
  const token = issueSuggestedCandidatesUnsubscribeToken(args.lead.uid);
  const { pick } = args;
  const memberUids = new Set(pick.sections.flatMap((section) => section.matches.map((item) => item.memberUid)));
  return {
    kind: pick.kind,
    leadName: args.lead.name,
    teamUid: args.teamUid,
    teamName: args.teamName,
    roles: pick.sections.map((section) => {
      const job = args.jobOf(section.roleUid);
      const applied = args.applied.get(job.uid) ?? new Set<string>();
      const criteria = args.criteria.get(job.uid) ?? [];
      return {
        roleUid: job.uid,
        roleTitle: job.roleTitle,
        matchCount: section.matches.length,
        appliedCount: section.matches.filter((item) => applied.has(item.memberUid)).length,
        candidates: section.cards.map((item) => emailCandidate(item, criteria)),
      };
    }),
    memberCount: memberUids.size,
    newCount: pick.newCount,
    newRoleCount: pick.sections.filter((section) => section.fresh.length > 0).length,
    preferencesUrl: `${args.baseUrl}/settings/email`,
    unsubscribeUrl: `${args.baseUrl}/settings/email/unsubscribed?token=${encodeURIComponent(token)}`,
  };
}

function emailCandidate(
  { row, person, label }: RoleItem,
  criteria: readonly MatchCriterionItem[]
): SuggestedCandidatesEmailCandidate {
  const marks = suggestionCriteria(row.payload, criteria);
  return {
    memberUid: row.memberUid,
    name: person.name,
    role: person.role,
    company: person.currentCompany ?? null,
    location: locationText(person.location),
    imageUrl: person.image?.url ?? null,
    label: labelText(label),
    blurb: row.blurb,
    requirements: marks.length ? { met: marks.filter((item) => item.matched).length, total: marks.length } : null,
  };
}

/** "City, Country" from a member's location, skipping blank parts; null when neither is known. */
export function locationText(
  location: { city: string | null; country: string | null } | null | undefined
): string | null {
  const parts = [location?.city, location?.country].map((part) => (part ?? '').trim()).filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'P2002';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
