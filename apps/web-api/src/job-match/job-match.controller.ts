import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { JobMatchService } from './job-match.service';

@ApiTags('Job match')
@Controller('v1/job-openings')
@UseGuards(UserTokenValidation)
@NoCache()
export class JobMatchController {
  constructor(private readonly jobMatchService: JobMatchService) {}

  @Get(':roleUid/suggested-candidates')
  async suggestedCandidates(@Param('roleUid') roleUid: string, @Req() request: Request) {
    return this.jobMatchService.listForRole(roleUid, request['userEmail']);
  }
}
