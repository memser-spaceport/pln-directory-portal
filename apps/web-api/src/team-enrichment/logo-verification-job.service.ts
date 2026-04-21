import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LogoVerificationService } from './logo-verification.service';
import { LogoVerificationPersistenceService } from './logo-verification-persistence.service';

@Injectable()
export class LogoVerificationJobService {
  private readonly logger = new Logger(LogoVerificationJobService.name);
  private isRunning = false;

  constructor(
    private readonly logoVerificationService: LogoVerificationService,
    private readonly persistenceService: LogoVerificationPersistenceService
  ) {}

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
    this.logger.log('Starting logo verification job');

    try {
      const provider = process.env.LOGO_VLM_PROVIDER || 'gemini';
      const model = this.resolveModel(provider);
      const batchSize = Number(process.env.LOGO_VERIFICATION_BATCH_SIZE || '20');
      const force = (process.env.LOGO_VERIFICATION_FORCE_UPDATE?.toLowerCase() ?? 'false') === 'true';

      const teams = await this.persistenceService.getTeamsForVerification(batchSize);
      this.logger.log(`Found ${teams.length} teams with logos`);

      let processed = 0;
      let skipped = 0;
      let failed = 0;

      for (const team of teams) {
        try {
          if (!team.logo?.url) {
            skipped++;
            continue;
          }

          const shouldVerify = await this.persistenceService.shouldVerifyTeam({
            teamUid: team.uid,
            logoUid: team.logoUid,
            provider,
            model,
            force,
          });

          if (!shouldVerify) {
            skipped++;
            continue;
          }

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
            provider,
            model,
            result,
          });

          processed++;
        } catch (error: any) {
          failed++;
          this.logger.error(
            `Failed logo verification for team ${team.uid} (${team.name}): ${error?.message}`,
            error?.stack
          );
        }
      }

      this.logger.log(
        `Logo verification job completed: processed=${processed}, skipped=${skipped}, failed=${failed}, total=${teams.length}`
      );
    } finally {
      this.isRunning = false;
    }
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
