import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MemberEnrichmentService } from './member-enrichment.service';

@Injectable()
export class MemberEnrichmentJob {
  private readonly logger = new Logger(MemberEnrichmentJob.name);
  private isEnrichmentRunning = false;
  private isMarkingRunning = false;

  constructor(private readonly memberEnrichmentService: MemberEnrichmentService) {}

  /** Per-pod in-memory flag — `true` while this pod's enrichment cron tick is mid-flight. */
  get enrichmentRunning(): boolean {
    return this.isEnrichmentRunning;
  }

  /** Per-pod in-memory flag — `true` while this pod's marking cron tick is mid-flight. */
  get markingRunning(): boolean {
    return this.isMarkingRunning;
  }

  // Default: every 5 minutes, same cadence as team enrichment.
  @Cron(process.env.MEMBER_ENRICHMENT_CRON || '*/5 * * * *', {
    name: 'member-enrichment',
    timeZone: 'UTC',
  })
  async runEnrichment(): Promise<void> {
    if (this.isEnrichmentRunning) {
      this.logger.log('Member enrichment job already in progress, skipping this run');
      return;
    }

    const isEnabled = (process.env.IS_MEMBER_ENRICHMENT_ENABLED?.toLowerCase() ?? 'false') === 'true';
    if (!isEnabled) {
      this.logger.log('Member enrichment is disabled via IS_MEMBER_ENRICHMENT_ENABLED');
      return;
    }

    this.isEnrichmentRunning = true;
    this.logger.log('Starting member enrichment job');

    try {
      const batchSize = this.getBatchSize();
      const members = await this.memberEnrichmentService.findMembersPendingEnrichment(batchSize);
      this.logger.log(`Found ${members.length} members pending enrichment (batch size ${batchSize})`);

      if (members.length === 0) return;

      let enriched = 0;
      let failed = 0;

      for (const member of members) {
        try {
          await this.memberEnrichmentService.enrichMember(member.uid);
          enriched++;
        } catch (error) {
          this.logger.error(`Failed to enrich member ${member.uid}: ${error.message}`, error.stack);
          failed++;
        }
      }

      this.logger.log(
        `Member enrichment job completed: ${enriched} enriched, ${failed} failed out of ${members.length} total`
      );
    } finally {
      this.isEnrichmentRunning = false;
    }
  }

  // Default: daily at 1 AM UTC — ahead of the team enrichment marking cron (2 AM).
  @Cron(process.env.MEMBER_ENRICHMENT_MARKING_CRON || '0 1 * * *', {
    name: 'daily-member-enrichment-marking',
    timeZone: 'UTC',
  })
  async runEnrichmentMarking(): Promise<void> {
    if (this.isMarkingRunning) {
      this.logger.log('Member enrichment marking job already in progress, skipping this run');
      return;
    }

    const isEnabled = (process.env.IS_MEMBER_ENRICHMENT_ENABLED?.toLowerCase() ?? 'false') === 'true';
    if (!isEnabled) {
      return;
    }

    this.isMarkingRunning = true;
    this.logger.log('Starting member enrichment marking job');

    try {
      const count = await this.memberEnrichmentService.markEligibleMembersForEnrichment();
      this.logger.log(`Member enrichment marking job completed: ${count} members marked`);
    } finally {
      this.isMarkingRunning = false;
    }
  }

  private getBatchSize(): number {
    const raw = process.env.MEMBER_ENRICHMENT_BATCH_SIZE?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 20;
  }
}
