import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LogoVerificationService } from './logo-verification.service';
import { LogoVerificationPersistenceService } from './logo-verification-persistence.service';

export interface VerifyAllPendingResult {
  /** Teams that received a fresh verification (TLVR row inserted, auto-promote possibly run). */
  processed: number;
  /** Teams skipped without a verify call (no logo URL, or `shouldVerifyTeam=false`). */
  skipped: number;
  /** Teams that threw during verify / persist. */
  failed: number;
  /** Total uids actually attempted (processed + skipped + failed). */
  attempted: number;
}

export interface VerifySingleResult {
  status: 'verified' | 'not_found' | 'no_logo' | 'already_verified';
  verdict?: string;
  confidence?: string;
}

interface JobConfig {
  provider: string;
  model: string | null;
  batchSize: number;
  force: boolean;
}

@Injectable()
export class LogoVerificationJobService {
  private readonly logger = new Logger(LogoVerificationJobService.name);
  private isRunning = false;

  constructor(
    private readonly logoVerificationService: LogoVerificationService,
    private readonly persistenceService: LogoVerificationPersistenceService
  ) {}

  /**
   * Cron entry point. Honors `IS_LOGO_VERIFICATION_ENABLED` and the
   * `LOGO_VERIFICATION_CRON` schedule env. Delegates the actual work to
   * `verifyAllPendingTeams` so the admin trigger endpoint executes the
   * identical pipeline.
   */
  @Cron(process.env.LOGO_VERIFICATION_CRON || '0 */6 * * *', {
    name: 'team-logo-verification',
    timeZone: 'UTC',
  })
  async run(): Promise<void> {
    if (this.isRunning) {
      this.logger.log('Logo verification job already running, skipping');
      return;
    }

    const isEnabled =
      (process.env.IS_LOGO_VERIFICATION_ENABLED?.toLowerCase() ?? 'false') === 'true';

    if (!isEnabled) {
      this.logger.log('Logo verification disabled via IS_LOGO_VERIFICATION_ENABLED');
      return;
    }

    this.isRunning = true;
    try {
      await this.verifyAllPendingTeams('system-cron');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Iterates EVERY eligible team in this run — not just one batch.
   *
   * `LOGO_VERIFICATION_BATCH_SIZE` is the chunk size per round-trip (memory
   * and per-query latency knob), not a per-run ceiling. The previous
   * implementation fetched up to `batchSize` teams once and exited, which
   * meant a backlog of N teams took `ceil(N / batchSize)` full cron ticks
   * (6h apart by default) to drain. The new loop fetches a chunk, processes
   * it sequentially, and re-queries until either the eligibility pool is
   * empty OR every uid has already been attempted in this run (force-mode
   * guard — the NOT EXISTS gate is disabled in force mode so the query
   * would otherwise return the same top-N forever).
   *
   * Mirrors `TeamEnrichmentService.triggerEnrichmentForAllPending` — single
   * sequential pass over the full eligible set per invocation.
   */
  async verifyAllPendingTeams(caller: string): Promise<VerifyAllPendingResult> {
    const config = this.resolveJobConfig();
    this.logger.log(
      `Logo verification (${caller}): starting — provider=${config.provider}, model=${config.model}, batchSize=${config.batchSize}, force=${config.force}`
    );

    const attempted = new Set<string>();
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    while (true) {
      const teams = await this.persistenceService.getTeamsForVerification({
        limit: config.batchSize,
        provider: config.provider,
        model: config.model,
        force: config.force,
        excludeUids: [...attempted],
      });
      if (teams.length === 0) break;

      for (const team of teams) {
        attempted.add(team.uid);
        const outcome = await this.processSingleTeam(team, config);
        if (outcome === 'processed') processed++;
        else if (outcome === 'skipped') skipped++;
        else failed++;
      }
    }

    this.logger.log(
      `Logo verification (${caller}): complete — processed=${processed}, skipped=${skipped}, failed=${failed}, attempted=${attempted.size}`
    );

    return { processed, skipped, failed, attempted: attempted.size };
  }

  /**
   * Verify a single team on demand. Used by the per-uid admin trigger
   * endpoint. Bypasses the `shouldVerifyTeam` dedupe — the admin explicitly
   * named this team, so we always make the VLM call (and `saveResult`'s
   * auto-promote logic still runs).
   */
  async verifyTeamByUid(uid: string, caller: string): Promise<VerifySingleResult> {
    const config = this.resolveJobConfig();
    const team = await this.persistenceService.getTeamForVerificationByUid(uid);
    if (!team) return { status: 'not_found' };
    if (!team.logo?.url) return { status: 'no_logo' };

    const result = await this.logoVerificationService.verifyLogo({
      teamName: team.name,
      website: team.website,
      logoUrl: team.logo.url,
      source: 'unknown',
    });
    await this.persistenceService.saveResult({
      teamUid: team.uid,
      logoUid: team.logoUid,
      website: team.website,
      logoUrl: team.logo.url,
      source: 'unknown',
      provider: config.provider,
      model: config.model,
      result,
    });
    this.logger.log(
      `Logo verification (${caller}): team=${uid} → verdict=${result.verdict}, confidence=${result.confidence}`
    );
    return { status: 'verified', verdict: result.verdict, confidence: result.confidence };
  }

  private async processSingleTeam(
    team: {
      uid: string;
      name: string;
      website: string | null;
      logoUid: string | null;
      logo: { uid: string; url: string } | null;
    },
    config: JobConfig
  ): Promise<'processed' | 'skipped' | 'failed'> {
    try {
      if (!team.logo?.url) return 'skipped';

      const shouldVerify = await this.persistenceService.shouldVerifyTeam({
        teamUid: team.uid,
        logoUid: team.logoUid,
        provider: config.provider,
        model: config.model,
        force: config.force,
      });
      if (!shouldVerify) return 'skipped';

      const result = await this.logoVerificationService.verifyLogo({
        teamName: team.name,
        website: team.website,
        logoUrl: team.logo.url,
        source: 'unknown',
      });
      await this.persistenceService.saveResult({
        teamUid: team.uid,
        logoUid: team.logoUid,
        website: team.website,
        logoUrl: team.logo.url,
        source: 'unknown',
        provider: config.provider,
        model: config.model,
        result,
      });
      return 'processed';
    } catch (error: any) {
      this.logger.error(
        `Failed logo verification for team ${team.uid} (${team.name}): ${error?.message}`,
        error?.stack
      );
      return 'failed';
    }
  }

  private resolveJobConfig(): JobConfig {
    const provider = process.env.LOGO_VLM_PROVIDER || 'gemini';
    return {
      provider,
      model: this.resolveModel(provider),
      batchSize: Number(process.env.LOGO_VERIFICATION_BATCH_SIZE || '20'),
      force: (process.env.LOGO_VERIFICATION_FORCE_UPDATE?.toLowerCase() ?? 'false') === 'true',
    };
  }

  private resolveModel(provider: string): string | null {
    switch (provider) {
      case 'gemini':
        return process.env.GEMINI_LOGO_VERIFICATION_MODEL || 'gemini-2.5-flash';
      case 'openai':
        return process.env.OPENAI_LOGO_VERIFICATION_MODEL || 'gpt-4.1-mini';
      case 'anthropic':
        return process.env.ANTHROPIC_LOGO_VERIFICATION_MODEL || 'claude-3-5-sonnet-latest';
      default:
        return null;
    }
  }
}
