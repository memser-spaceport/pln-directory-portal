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
  parseEmailTeamAllowlist,
  pickSuggestedEmail,
  type MatchCriterionItem,
  type SuggestedEmailKind,
  type SuggestedEmailPick,
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

    const teamCache = new Map<string, { name: string | null; leads: Lead[] }>();
    for (const job of jobs) {
      if (!isLiveOpening(job) || !job.teamUid || !allowlist.has(job.teamUid)) continue;
      const teamUid = job.teamUid;

      const listed = await listRunSuggestions(this.prisma, runUid, job.uid);
      if (!listed.length) continue;

      let team = teamCache.get(teamUid);
      if (!team) {
        team = await this.loadTeam(teamUid);
        teamCache.set(teamUid, team);
      }
      if (!team.leads.length) continue;

      const optedIn = await this.preference.enabledFor(team.leads.map((lead) => lead.uid));
      // Every lead's earlier emails for the role, newest first: this run's claims and the history `pick` reads.
      const sentForRole = await this.prisma.jobMatchEmailSend.findMany({
        where: { roleUid: job.uid },
        orderBy: { sentAt: 'desc' },
        select: { runUid: true, recipientUid: true, kind: true, memberUids: true },
      });
      const items = listed.map((item) => ({ ...item, memberUid: item.row.memberUid }));
      const memberUids = items.map((item) => item.memberUid);
      const notLooking = await this.notLookingUids(memberUids);
      let contacted: Set<string> | undefined;

      // The role's current criteria, read once per role and only when an email is rendered.
      let criteria: MatchCriterionItem[] | undefined;
      for (const lead of team.leads) {
        const mine = sentForRole.filter((send) => send.recipientUid === lead.uid);
        if (!optedIn.has(lead.uid) || mine.some((send) => send.runUid === runUid)) {
          result.skipped++;
          continue;
        }
        contacted ??= await this.contactedUids(job.uid, memberUids);
        const pick = pickSuggestedEmail({
          listed: items,
          notLooking,
          // A row from before kinds existed names nobody, so it is not history.
          history: mine
            .filter((send) => send.memberUids.length > 0)
            .map((send) => ({ kind: EMAIL_KIND[send.kind], memberUids: send.memberUids })),
          contacted,
        });
        if (!pick) continue;

        if (mode === 'dry-run') {
          this.logger.log(
            `DRY RUN would email ${lead.uid} ${lead.email} about role ${job.uid} "${job.roleTitle}" (team ${teamUid}): ${pick.kind}, ${pick.candidates.length} named of ${items.length} listed`
          );
          result.sent++;
          continue;
        }

        criteria ??= (await currentRoleCriteria(this.prisma, job)).all;
        const email = renderSuggestedCandidatesEmail(
          emailInput({ lead, teamUid, teamName: team.name ?? job.companyName, job, pick, baseUrl, criteria })
        );
        if (mode === 'preview') {
          this.preview(email, lead, job.uid);
          result.sent++;
          continue;
        }
        const delivered = await this.claimAndSend(email, lead, {
          runUid,
          roleUid: job.uid,
          teamUid,
          kind: DB_KIND[pick.kind],
          memberUids: pick.candidates.map((item) => item.memberUid),
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
   * Claim first so two overlapping sends cannot both email the lead; drop the claim again when SES fails.
   * Only a delivered email is tracked (`suggested-candidates-email-sent`); dry runs and previews never get here.
   */
  private async claimAndSend(
    email: RenderedEmail,
    lead: Lead,
    claim: { runUid: string; roleUid: string; teamUid: string; kind: JobMatchEmailKind; memberUids: string[] }
  ): Promise<boolean> {
    let claimUid: string;
    try {
      const row = await this.prisma.jobMatchEmailSend.create({
        data: { ...claim, candidateCount: claim.memberUids.length, recipientUid: lead.uid },
        select: { uid: true },
      });
      claimUid = row.uid;
    } catch (error) {
      if (isUniqueConflict(error)) return false;
      throw error;
    }
    try {
      await this.awsService.sendHtmlEmail({
        from: process.env.SES_SOURCE_EMAIL || 'no-reply@plnetwork.io',
        to: [lead.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
    } catch (error) {
      this.logger.error(
        `suggested-candidates email to ${lead.uid} for role ${claim.roleUid} failed: ${errorText(error)}`
      );
      await this.prisma.jobMatchEmailSend.delete({ where: { uid: claimUid } }).catch((deleteError) => {
        this.logger.error(`could not delete email claim ${claimUid} after a failed send: ${errorText(deleteError)}`);
      });
      return false;
    }
    trackSuggestedCandidatesEmailSent(this.analytics, this.logger, {
      recipientUid: lead.uid,
      runUid: claim.runUid,
      roleUid: claim.roleUid,
      teamUid: claim.teamUid,
      kind: EMAIL_KIND[claim.kind],
      candidateCount: claim.memberUids.length,
    });
    return true;
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

  private preview(email: RenderedEmail, lead: Lead, roleUid: string) {
    try {
      const previewPath = path.join(os.tmpdir(), `suggested-candidates-${roleUid}-${lead.uid}-${Date.now()}.html`);
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
  job: { uid: string; roleTitle: string };
  pick: SuggestedEmailPick<ListedSuggestion>;
  baseUrl: string;
  criteria: readonly MatchCriterionItem[];
}): SuggestedCandidatesEmailInput {
  const token = issueSuggestedCandidatesUnsubscribeToken(args.lead.uid);
  const { pick } = args;
  return {
    ...(pick.kind === 'new' ? { kind: 'new', alreadySeenCount: pick.alreadySeenCount } : { kind: pick.kind }),
    leadName: args.lead.name,
    teamUid: args.teamUid,
    teamName: args.teamName,
    roleUid: args.job.uid,
    roleTitle: args.job.roleTitle,
    candidates: pick.candidates.map(({ row, person, label }) => ({
      memberUid: row.memberUid,
      name: person.name,
      role: person.role,
      imageUrl: person.image?.url ?? null,
      label: labelText(label),
      blurb: row.blurb,
      location: locationText(person.location),
      criteria: suggestionCriteria(row.payload, args.criteria).map((item) => ({
        statement: item.text,
        ...(item.label ? { label: item.label } : {}),
        matched: item.matched,
      })),
    })),
    preferencesUrl: `${args.baseUrl}/settings/email`,
    unsubscribeUrl: `${args.baseUrl}/settings/email/unsubscribed?token=${encodeURIComponent(token)}`,
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
