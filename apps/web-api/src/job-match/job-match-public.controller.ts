import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  SuggestedCandidatesUnsubscribeRequestSchema,
  type SuggestedCandidatesUnsubscribeResponse,
} from 'libs/contracts/src/schema/job-match';
import { NoCache } from '../decorators/no-cache.decorator';
import { SuggestedCandidatesEmailPreferenceService } from '../notification-settings/suggested-candidates-email-preference.service';
import { verifySuggestedCandidatesUnsubscribeToken } from './suggested-candidates-token.util';

/**
 * Public, unguarded: the signed token from the suggested-candidates email is the only credential (LAB-2850).
 * The body is checked with `safeParse` and an explicit 400, unlike the job-alerts public controller's `.parse()`,
 * whose ZodError would not surface as a 400.
 */
@ApiTags('Job match - Public')
@Controller('v1/job-match')
export class JobMatchPublicController {
  constructor(private readonly preference: SuggestedCandidatesEmailPreferenceService) {}

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
    try {
      await this.preference.set(memberUid, false);
    } catch (error) {
      if (error instanceof NotFoundException) throw new BadRequestException('Unknown member');
      throw error;
    }
    return { memberUid, suggestedCandidatesEmailEnabled: false };
  }
}
