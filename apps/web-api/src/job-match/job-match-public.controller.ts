import { BadRequestException, Body, Controller, HttpCode, Logger, NotFoundException, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  SuggestedCandidatesUnsubscribeRequestSchema,
  type SuggestedCandidatesUnsubscribeResponse,
} from 'libs/contracts/src/schema/job-match';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { SuggestedCandidatesEmailPreferenceService } from '../notification-settings/suggested-candidates-email-preference.service';
import { trackSuggestedCandidatesEmailUnsubscribed } from './job-match-analytics';
import { verifySuggestedCandidatesUnsubscribeToken } from './suggested-candidates-token.util';

/**
 * Public, unguarded: the signed token from the suggested-candidates email is the only credential (LAB-2850).
 * The body is checked with `safeParse` and an explicit 400, unlike the job-alerts public controller's `.parse()`,
 * whose ZodError would not surface as a 400.
 */
@ApiTags('Job match - Public')
@Controller('v1/job-match')
export class JobMatchPublicController {
  private readonly logger = new Logger(JobMatchPublicController.name);

  constructor(
    private readonly preference: SuggestedCandidatesEmailPreferenceService,
    private readonly analytics: AnalyticsService
  ) {}

  @Post('unsubscribe')
  @HttpCode(200)
  @NoCache()
  async unsubscribe(@Body() body: unknown): Promise<SuggestedCandidatesUnsubscribeResponse> {
    const parsed = SuggestedCandidatesUnsubscribeRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException('token is required');
    }
    let memberUid: string;
    try {
      memberUid = verifySuggestedCandidatesUnsubscribeToken(parsed.data.token).memberUid;
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid token');
    }
    let changed: boolean;
    try {
      ({ changed } = await this.preference.unsubscribe(memberUid));
    } catch (error) {
      if (error instanceof NotFoundException) throw new BadRequestException('Unknown member');
      throw error;
    }
    // Tracked only when the link actually turned the email off, so a repeated click is not a second unsubscribe.
    if (changed) trackSuggestedCandidatesEmailUnsubscribed(this.analytics, this.logger, { memberUid });
    return { memberUid, suggestedCandidatesEmailEnabled: false };
  }
}
