import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  InternalServerErrorException,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ServiceAuthGuard } from '../guards/service-auth.guard';
import { jobMatchBlocker, normalizeTeamUids } from './job-match.logic';
import { JobMatchRunner } from './job-match-runner.service';

@ApiTags('Job match - Service')
@Controller('v1/service')
@UseGuards(ServiceAuthGuard)
export class JobMatchServiceController {
  constructor(private readonly runner: JobMatchRunner) {}

  @Post('job-match/run')
  @HttpCode(200)
  async run(@Body() body?: { teamUids?: unknown }) {
    const blocker = jobMatchBlocker();
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
    return this.runner.start(teamUids);
  }
}
