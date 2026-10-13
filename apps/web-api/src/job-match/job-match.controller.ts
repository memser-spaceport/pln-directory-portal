import { BadRequestException, Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  MatchCriteriaUpdateBodySchema,
  SuggestedCandidateContactBodySchema,
} from 'libs/contracts/src/schema/job-match';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { JobMatchService } from './job-match.service';

/**
 * Bodies are checked with `safeParse` and an explicit 400: a bare `.parse()` would let a ZodError surface
 * as a 500 for what is a bad request.
 */
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

  @Put(':roleUid/match-criteria')
  async updateMatchCriteria(@Param('roleUid') roleUid: string, @Body() body: unknown, @Req() request: Request) {
    const parsed = MatchCriteriaUpdateBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('disabled must be an array of criterion texts');
    }
    return this.jobMatchService.updateCriteria(roleUid, parsed.data.disabled, request['userEmail']);
  }

  @Post(':roleUid/suggested-candidates/:memberUid/contact')
  async contactCandidate(
    @Param('roleUid') roleUid: string,
    @Param('memberUid') memberUid: string,
    @Body() body: unknown,
    @Req() request: Request
  ) {
    const parsed = SuggestedCandidateContactBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(`message must be 1 to ${CONTACT_MESSAGE_MAX_LENGTH} characters`);
    }
    return this.jobMatchService.contactCandidate(roleUid, memberUid, parsed.data.message, request['userEmail']);
  }
}
