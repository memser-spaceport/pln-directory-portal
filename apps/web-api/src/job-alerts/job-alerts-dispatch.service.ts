import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Handlebars from 'handlebars';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import pLimit from 'p-limit';
import type { JobAlertFilterState } from 'libs/contracts/src/schema/job-alert';
import { JobOpeningsQueryService } from '../job-openings/job-openings-query.service';
import { PrismaService } from '../shared/prisma.service';
import { AwsService } from '../utils/aws/aws.service';
import { JOB_INGEST_COMPLETED, JobIngestCompletedPayload } from './job-alerts.events';
import { issueJobAlertToken } from './job-alerts-token.util';
import { seniorityLabel } from './job-alerts.utils';

const DIGEST_TEMPLATE = path.join(__dirname, 'shared', 'jobAlertDigest.hbs');
const CONFIRMATION_TEMPLATE = path.join(__dirname, 'shared', 'jobAlertConfirmation.hbs');
const MAX_ROLES_IN_EMAIL = 10;
const BATCH_SIZE = 50;
const EMAIL_CONCURRENCY = 5;

const buildAppUrl = (pathname: string) => {
  const base = process.env.WEB_UI_BASE_URL || process.env.APPLICATION_BASE_URL || 'https://www.plnetwork.io';
  return `${base.replace(/\/$/, '')}${pathname}`;
};

@Injectable()
export class JobAlertsDispatchService {
  private readonly logger = new Logger(JobAlertsDispatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobOpeningsQueryService: JobOpeningsQueryService,
    private readonly awsService: AwsService
  ) {}

  @OnEvent(JOB_INGEST_COMPLETED)
  async onJobIngestCompleted(payload: JobIngestCompletedPayload) {
    this.logger.log(
      `Received ${JOB_INGEST_COMPLETED} runId=${payload.runId} created=${payload.created} updated=${payload.updated}`
    );
    if (payload.created === 0 && payload.updated === 0) {
      this.logger.log('Skipping dispatch: no new or updated jobs in this run');
      return;
    }
    await this.dispatch(payload);
  }

  async dispatch(payload: JobIngestCompletedPayload): Promise<{ sent: number; skipped: number }> {
    let sent = 0;
    let skipped = 0;
    let cursor: string | undefined;

    do {
      const batch = await this.prisma.jobAlert.findMany({
        where: { deletedAt: null },
        select: {
          uid: true,
          memberUid: true,
          name: true,
          filterState: true,
          lastSentAt: true,
          createdAt: true,
          member: { select: { uid: true, email: true, name: true, deletedAt: true } },
        },
        take: BATCH_SIZE,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { uid: cursor } : undefined,
        orderBy: { uid: 'asc' },
      });

      if (batch.length === 0) break;

      const validAlerts = batch.filter(
        (alert): alert is typeof alert & { member: NonNullable<typeof alert.member> & { email: string } } =>
          Boolean(alert.member?.email && !alert.member.deletedAt)
      );
      skipped += batch.length - validAlerts.length;

      const alreadySent = await this.getAlreadySentAlerts(
        validAlerts.map((a) => a.uid),
        payload.runId
      );

      const alertsToProcess = validAlerts.filter((alert) => !alreadySent.has(alert.uid));
      skipped += validAlerts.length - alertsToProcess.length;

      if (alertsToProcess.length > 0) {
        const batchResults = await this.processBatch(alertsToProcess, payload.runId);
        sent += batchResults.sent;
        skipped += batchResults.skipped;
      }

      cursor = batch.length === BATCH_SIZE ? batch[batch.length - 1].uid : undefined;
      this.logger.log(`Processed batch of ${batch.length} alerts, cursor: ${cursor ?? 'end'}`);
    } while (cursor);

    this.logger.log(`Dispatch complete for runId=${payload.runId}: ${sent} alerts had matches, ${skipped} skipped`);
    return { sent, skipped };
  }

  private async getAlreadySentAlerts(alertUids: string[], runId: string): Promise<Set<string>> {
    const existing = await this.prisma.jobAlertSendRun.findMany({
      where: {
        alertUid: { in: alertUids },
        ingestRunId: runId,
      },
      select: { alertUid: true },
    });
    return new Set(existing.map((r) => r.alertUid));
  }

  private async processBatch(
    alerts: Array<{
      uid: string;
      memberUid: string;
      name: string;
      filterState: unknown;
      lastSentAt: Date | null;
      createdAt: Date;
      member: { uid: string; email: string; name: string | null; deletedAt: Date | null };
    }>,
    runId: string
  ): Promise<{ sent: number; skipped: number }> {
    let sent = 0;
    let skipped = 0;
    const limit = pLimit(EMAIL_CONCURRENCY);

    const tasks = alerts.map((alert) =>
      limit(async () => {
        const filterState = alert.filterState as unknown as JobAlertFilterState;
        const sinceTs = alert.lastSentAt ?? alert.createdAt;

        try {
          const matches = await this.jobOpeningsQueryService.findNewMatchesSince(
            { ...filterState, page: 1, limit: 50, sort: 'newest' },
            sinceTs
          );

          if (matches.length === 0) {
            this.logger.log(`Alert ${alert.uid}: no new matches since ${sinceTs.toISOString()}`);
            skipped++;
            return;
          }

          await this.sendDigestEmail({
            alertUid: alert.uid,
            alertName: alert.name,
            memberEmail: alert.member.email,
            matches,
            filterState,
          });

          await this.prisma.jobAlertSendRun.create({
            data: {
              alertUid: alert.uid,
              ingestRunId: runId,
              matchCount: matches.length,
              emailType: 'digest',
            },
          });

          await this.prisma.jobAlert.update({
            where: { uid: alert.uid },
            data: { lastSentAt: new Date() },
          });

          sent++;
        } catch (err) {
          this.logger.error(`Failed to dispatch alert ${alert.uid}: ${(err as Error).message}`);
          skipped++;
        }
      })
    );

    await Promise.all(tasks);

    return { sent, skipped };
  }

  async sendConfirmationEmail(args: {
    alertUid: string;
    alertName: string;
    memberEmail: string;
    matches: Awaited<ReturnType<JobOpeningsQueryService['findNewMatchesSince']>>;
    filterState: JobAlertFilterState;
  }) {
    const { alertUid, alertName, memberEmail, matches, filterState } = args;
    const subject = `${matches.length} role${matches.length === 1 ? '' : 's'} match from PL network: ${alertName}`;
    const data = this.buildEmailData({ alertUid, alertName, matches, filterState });
    await this.send({ template: CONFIRMATION_TEMPLATE, subject, data, to: memberEmail });
    await this.prisma.jobAlertSendRun.create({
      data: {
        alertUid,
        ingestRunId: `confirmation-${alertUid}`,
        matchCount: matches.length,
        emailType: 'confirmation',
      },
    });
  }

  private async sendDigestEmail(args: {
    alertUid: string;
    alertName: string;
    memberEmail: string;
    matches: Awaited<ReturnType<JobOpeningsQueryService['findNewMatchesSince']>>;
    filterState: JobAlertFilterState;
  }) {
    const { alertUid, alertName, memberEmail, matches, filterState } = args;
    const subject = `${matches.length} new role${matches.length === 1 ? '' : 's'} match from PL network: ${alertName}`;
    const data = this.buildEmailData({ alertUid, alertName, matches, filterState });
    await this.send({ template: DIGEST_TEMPLATE, subject, data, to: memberEmail });
  }

  private buildEmailData(args: {
    alertUid: string;
    alertName: string;
    matches: Awaited<ReturnType<JobOpeningsQueryService['findNewMatchesSince']>>;
    filterState: JobAlertFilterState;
  }) {
    const { alertUid, alertName, matches, filterState } = args;
    const utmCode = Math.random().toString(36).slice(2, 10);
    const trimmed = matches.slice(0, MAX_ROLES_IN_EMAIL);
    const rolesData = trimmed.map((role, idx) => {
      const applyUrl = role.sourceLink
        ? buildAppUrl(
            `/jobs/redirect?token=${encodeURIComponent(
              issueJobAlertToken({ purpose: 'redirect', alertUid, jobUid: role.uid, applyUrl: role.sourceLink })
            )}&utm_source=job_alerts&utm_medium=email&utm_code=${utmCode}&alert_uid=${alertUid}&job_uid=${
              role.uid
            }&position=${idx + 1}`
          )
        : null;
      return {
        roleTitle: role.roleTitle,
        teamName: role.team?.name ?? '',
        location: (role.location ?? []).join(' · '),
        seniority: role.seniority ? seniorityLabel(role.seniority) : null,
        applyUrl,
      };
    });

    const filterQuery = this.filterStateToQueryString(filterState);
    const unsubToken = issueJobAlertToken({ purpose: 'unsubscribe', alertUid });

    return {
      matchCount: matches.length,
      matchCountIsOne: matches.length === 1,
      alertName,
      roles: rolesData,
      hasMore: matches.length > MAX_ROLES_IN_EMAIL,
      viewAllUrl: buildAppUrl(`/jobs${filterQuery ? `?${filterQuery}` : ''}`),
      unsubscribeUrl: buildAppUrl(`/jobs/unsubscribed?token=${encodeURIComponent(unsubToken)}`),
    };
  }

  private filterStateToQueryString(filterState: JobAlertFilterState): string {
    const params = new URLSearchParams();
    if (filterState.q) params.set('q', filterState.q);
    for (const key of ['roleCategory', 'seniority', 'focus', 'location'] as const) {
      for (const value of filterState[key] ?? []) params.append(key, value);
    }
    const workplaceTypes = new Set<string>();
    for (const m of filterState.workMode ?? []) {
      if (m === 'remote' || m === 'distributed') workplaceTypes.add('remote');
      else if (m === 'hybrid' || m === 'in-office') workplaceTypes.add(m);
    }
    for (const wt of workplaceTypes) params.append('workplaceType', wt);
    return params.toString();
  }

  private async send(args: { template: string; subject: string; data: unknown; to: string }) {
    const fromAddress = process.env.SES_SOURCE_EMAIL || 'no-reply@plnetwork.io';

    if (!this.awsService.isEmailServiceEnabled()) {
      this.previewToConsole(args, fromAddress);
      return null;
    }

    return this.awsService.sendEmailWithTemplate(
      args.template,
      args.data,
      args.subject,
      args.subject,
      fromAddress,
      [args.to],
      []
    );
  }

  private previewToConsole(args: { template: string; subject: string; data: unknown; to: string }, from: string) {
    try {
      const tpl = fs.readFileSync(args.template, 'utf-8');
      Handlebars.registerHelper('eq', (a, b) => a === b);
      Handlebars.registerHelper('and', (...rest) => rest.every(Boolean));
      const html = Handlebars.compile(tpl)(args.data);
      const filename = `job-alert-${path.basename(args.template).replace('.hbs', '')}-${Date.now()}.html`;
      const previewPath = path.join(os.tmpdir(), filename);
      fs.writeFileSync(previewPath, html, 'utf-8');
      this.logger.log(
        '\n────── EMAIL PREVIEW (IS_EMAIL_ENABLED is not true) ──────\n' +
          `  From:    ${from}\n` +
          `  To:      ${args.to}\n` +
          `  Subject: ${args.subject}\n` +
          `  Preview: file://${previewPath}\n` +
          '─────────────────────────────────────────────────────────'
      );
    } catch (err) {
      this.logger.error(`Failed to render email preview: ${(err as Error).message}`);
    }
  }
}
