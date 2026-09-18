import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { MemberCvImportsService } from '../member-cv-imports/member-cv-imports.service';
import {
  applicationSelect,
  jobInterestSelect,
  teamInterestSelect,
  toApplicationRow,
  toJobInterestRow,
  toTeamInterestRow,
} from './candidate-rows';

/**
 * Pushes a new application or interest to the team's ATS the moment it happens,
 * so a recruiter sees it in seconds instead of at the next poll.
 *
 * Best effort by design: nothing is queued and nothing is retried. The ATS
 * polls the same rows from the candidates feed and is idempotent on their uids,
 * so a failed push costs latency, not data. Every call is fire-and-forget — a
 * slow or dead ATS must never make a member's apply hang or fail.
 *
 * ATS_PUSH_TEAM_UID is what keeps one team's people out of another team's ATS:
 * with a single target configured in the environment, it is the only scoping
 * there is.
 */
const PUSH_TIMEOUT_MS = 5000;

@Injectable()
export class AtsPushService {
  private readonly logger = new Logger(AtsPushService.name);

  constructor(private readonly prisma: PrismaService, private readonly cvImports: MemberCvImportsService) {}

  private config(): { url: string; key: string; teamUid: string } | null {
    const url = process.env.ATS_PUSH_URL;
    const key = process.env.ATS_PUSH_KEY;
    const teamUid = process.env.ATS_PUSH_TEAM_UID;
    return url && key && teamUid ? { url, key, teamUid } : null;
  }

  enabled(): boolean {
    return this.config() !== null;
  }

  pushApplication(applicationUid: string): void {
    void this.deliver(async (teamUid) => {
      const row = await this.prisma.jobApplication.findFirst({
        where: { uid: applicationUid, jobOpening: { teamUid } },
        select: applicationSelect,
      });
      if (!row) return null;
      const cvUrl = await this.cvImports.getSignedPreviewUrl(row.member.uid);
      return { applications: [toApplicationRow(row, cvUrl)] };
    });
  }

  pushJobInterest(interestUid: string): void {
    void this.deliver(async (teamUid) => {
      const row = await this.prisma.jobOpeningInterest.findFirst({
        where: { uid: interestUid, jobOpening: { teamUid } },
        select: jobInterestSelect,
      });
      return row ? { interests: [toJobInterestRow(row)] } : null;
    });
  }

  pushTeamInterest(interestUid: string): void {
    void this.deliver(async (teamUid) => {
      const row = await this.prisma.teamInterest.findFirst({ where: { uid: interestUid, teamUid }, select: teamInterestSelect });
      return row ? { interests: [toTeamInterestRow(row)] } : null;
    });
  }

  private async deliver(build: (teamUid: string) => Promise<object | null>): Promise<void> {
    const config = this.config();
    if (!config) return;
    try {
      const body = await build(config.teamUid);
      // Null means the row belongs to another team, which is not this ATS's business.
      if (!body) return;
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), PUSH_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(config.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: abort.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        this.logger.warn(`ATS push answered ${response.status}; the ATS poll will pick this up`);
      }
    } catch (error) {
      this.logger.warn(`ATS push failed (${error instanceof Error ? error.message : String(error)}); the ATS poll will pick this up`);
    }
  }
}
