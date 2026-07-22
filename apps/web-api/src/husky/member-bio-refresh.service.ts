import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { MemberScrapingDogService } from './member-scrapingdog.service';
import {
  BioRefreshRunResult,
  countAiGeneratedBios,
  runMemberBioRefresh,
} from './member-bio-refresh.util';

export interface BioRefreshTriggerOptions {
  dryRun: boolean;
  limit?: number | null;
  emails?: string[];
  noScrape?: boolean;
}

interface BioRefreshRunRecord {
  startedAt: string;
  finishedAt: string | null;
  options: BioRefreshTriggerOptions;
  result: BioRefreshRunResult | null;
  error: string | null;
}

/**
 * Admin-triggered refresh of AI-generated member bios (gender-accuracy fix).
 * Mirrors the team-enrichment admin pattern: an apply run is fire-and-forget
 * with an in-memory re-entrancy flag, progress polled via getStatus(). The
 * flag is per-pod — with multiple replicas another pod could start a second
 * run; acceptable for a manually-triggered maintenance job, same trade-off
 * the enrichment cron status endpoint documents.
 */
@Injectable()
export class MemberBioRefreshService {
  private readonly logger = new Logger(MemberBioRefreshService.name);
  private isRunning = false;
  private lastRun: BioRefreshRunRecord | null = null;

  constructor(private prisma: PrismaService, private scrapingDog: MemberScrapingDogService) {}

  async getStatus() {
    return {
      isRunning: this.isRunning,
      totalAiGeneratedBios: await countAiGeneratedBios(this.prisma),
      lastRun: this.lastRun,
    };
  }

  /**
   * Dry-run resolves pronouns from free signals only (no OpenAI, no
   * ScrapingDog) and returns the full report synchronously. An apply run
   * starts in the background and returns immediately.
   */
  async trigger(options: BioRefreshTriggerOptions) {
    if (this.isRunning) {
      return { started: false, message: 'A bio refresh is already running — poll the status endpoint' };
    }

    if (options.dryRun) {
      const result = await runMemberBioRefresh(
        this.prisma,
        this.scrapingDog,
        { apply: false, limit: options.limit, emails: options.emails, noScrape: options.noScrape },
        (line) => this.logger.log(line)
      );
      return { dryRun: true, ...result };
    }

    const record: BioRefreshRunRecord = {
      startedAt: new Date().toISOString(),
      finishedAt: null,
      options,
      result: null,
      error: null,
    };
    this.isRunning = true;
    this.lastRun = record;

    runMemberBioRefresh(
      this.prisma,
      this.scrapingDog,
      { apply: true, limit: options.limit, emails: options.emails, noScrape: options.noScrape },
      (line) => this.logger.log(line)
    )
      .then((result) => {
        record.result = result;
      })
      .catch((error) => {
        record.error = (error as Error).message;
        this.logger.error(`Background bio refresh failed: ${(error as Error).message}`, (error as Error).stack);
      })
      .finally(() => {
        record.finishedAt = new Date().toISOString();
        this.isRunning = false;
      });

    return {
      started: true,
      totalAiGeneratedBios: await countAiGeneratedBios(this.prisma),
      message: 'Bio refresh triggered in background — poll GET /v1/admin/members/ai-bios/status for progress',
    };
  }
}
