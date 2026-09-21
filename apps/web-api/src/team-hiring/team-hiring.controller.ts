import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ApplicantReviewedBodySchema, HiringCandidateKindSchema } from 'libs/contracts/src/schema/team-hiring';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { TeamHiringService } from './team-hiring.service';

/**
 * The team applicants page's routes.
 *
 * Under `/v1/job-openings` to match what the frontend already calls, although
 * everything else there is scoped to the calling member and these are scoped to
 * a team. The two writes carry no team at all — it is resolved from the row they
 * address, and the same lead-or-admin rule applied to it.
 *
 * Validation is `safeParse` plus an explicit 400 rather than a bare `.parse()`:
 * an uncaught ZodError leaves the app to answer 500 for what is a bad request.
 */
@ApiTags('Team applicants')
@Controller('v1/job-openings')
@UseGuards(UserTokenValidation)
@NoCache()
export class TeamHiringController {
  constructor(private readonly teamHiringService: TeamHiringService) {}

  @Get('teams/:teamUid/applicant-counts')
  async applicantCounts(@Param('teamUid') teamUid: string, @Req() req: Request) {
    const viewerUid = await this.teamHiringService.assertCanRead(teamUid, req['userEmail']);
    return this.teamHiringService.counts(teamUid, viewerUid);
  }

  @Get('teams/:teamUid/roles/:roleUid/applicants')
  async roleApplicants(@Param('teamUid') teamUid: string, @Param('roleUid') roleUid: string, @Req() req: Request) {
    const viewerUid = await this.teamHiringService.assertCanRead(teamUid, req['userEmail']);
    return this.teamHiringService.roleApplicants(teamUid, roleUid, viewerUid);
  }

  @Post(':kind/:uid/reviewed')
  async setReviewed(
    @Param('kind') kind: string,
    @Param('uid') uid: string,
    @Body() body: unknown,
    @Req() req: Request
  ) {
    const parsedKind = this.parseKind(kind);
    const parsedBody = ApplicantReviewedBodySchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException('reviewed must be a boolean');
    }
    return this.teamHiringService.setReviewed(parsedKind, uid, parsedBody.data.reviewed, req['userEmail']);
  }

  @Post(':kind/:uid/seen')
  async markSeen(@Param('kind') kind: string, @Param('uid') uid: string, @Req() req: Request) {
    return this.teamHiringService.markSeen(this.parseKind(kind), uid, req['userEmail']);
  }

  private parseKind(kind: string) {
    const parsed = HiringCandidateKindSchema.safeParse(kind);
    if (!parsed.success) {
      throw new BadRequestException('kind must be "applications" or "interests"');
    }
    return parsed.data;
  }
}
