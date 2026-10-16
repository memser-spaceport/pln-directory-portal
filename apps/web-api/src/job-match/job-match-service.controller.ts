import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  InternalServerErrorException,
  NotFoundException,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  SuggestedCandidatesEmailSendRequestSchema,
  type SuggestedCandidatesEmailSendResponse,
} from 'libs/contracts/src/schema/job-match';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { jobMatchBlocker, normalizeTeamUids } from './job-match.logic';
import { JobMatchRunner } from './job-match-runner.service';
import { SuggestedCandidatesEmailService } from './suggested-candidates-email.service';

@ApiTags('Job match - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class JobMatchServiceController {
  constructor(
    private readonly runner: JobMatchRunner,
    private readonly suggestedCandidatesEmail: SuggestedCandidatesEmailService
  ) {}

  @Post('job-match/run')
  @HttpCode(200)
  async run(@Body() body?: { teamUids?: unknown }) {
    const blocker = jobMatchBlocker({ ignoreEnabledFlag: true });
    if (blocker?.code === 'disabled') {
      throw new ServiceUnavailableException(blocker.message);
    }
    if (blocker) {
      throw new InternalServerErrorException(blocker.message);
    }
    let teamUids: string[] | undefined;
    try {
      teamUids = normalizeTeamUids(body?.teamUids);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid teamUids');
    }
    return this.runner.start(teamUids, { ignoreEnabledFlag: true });
  }

  /**
   * Runs the suggested-candidates email for a run (LAB-2850): to retry a send lost to a restart, or to test
   * without waiting for Monday. Same gates and no-repeat rule as the event path. Awaits the send.
   */
  @Post('job-match/suggested-candidates-email')
  @HttpCode(200)
  async sendSuggestedCandidatesEmail(@Body() body?: unknown): Promise<SuggestedCandidatesEmailSendResponse> {
    const parsed = SuggestedCandidatesEmailSendRequestSchema.safeParse(body ?? {});
    if (!parsed.success) {
      throw new BadRequestException('runUid must be a non-empty string when given');
    }
    const run = await this.suggestedCandidatesEmail.completedRun(parsed.data.runUid);
    if (!run) {
      throw new NotFoundException(
        parsed.data.runUid ? 'No completed job match run with this uid' : 'No completed job match run'
      );
    }
    return this.suggestedCandidatesEmail.sendForRun(run.uid);
  }
}
