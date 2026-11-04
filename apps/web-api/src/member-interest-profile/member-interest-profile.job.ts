import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PROFILE_CRON } from './member-interest-profile.constants';
import { MemberInterestProfileService } from './member-interest-profile.service';

/** Daily member interest profile rebuild (LAB-3122). One instance wins the run claim. */
@Injectable()
export class MemberInterestProfileJob {
  private readonly logger = new Logger(MemberInterestProfileJob.name);

  constructor(private readonly profiles: MemberInterestProfileService) {}

  @Cron(PROFILE_CRON, { name: 'member-interest-profile-rebuild', timeZone: 'UTC' })
  async run(): Promise<void> {
    try {
      await this.profiles.rebuild('CRON');
    } catch (error) {
      this.logger.error(
        `Daily member interest profile rebuild failed: ${error instanceof Error ? error.message : error}`
      );
    }
  }
}
