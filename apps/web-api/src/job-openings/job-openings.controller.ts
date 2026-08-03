import { BadRequestException, Controller, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { ZodError, ZodType } from 'zod';
import { apiJobOpenings } from 'libs/contracts/src/lib/contract-job-openings';
import { JobsListQueryParams } from 'libs/contracts/src/schema/job-opening';
import { CreateJobReferralSchema, JobReferralDraftQuerySchema } from 'libs/contracts/src/schema/job-referral';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserAuthValidateGuard } from '../guards/user-auth-validate.guard';
import { JobOpeningsQueryService } from './job-openings-query.service';
import { JobOpeningsReferralService } from './job-openings-referral.service';

const server = initNestServer(apiJobOpenings);

@Controller()
export class JobOpeningsController {
  constructor(
    private readonly jobOpeningsQueryService: JobOpeningsQueryService,
    private readonly jobOpeningsReferralService: JobOpeningsReferralService
  ) {}

  @Api(server.route.getJobs)
  @NoCache()
  async getJobs(@Req() request: Request) {
    const params = JobsListQueryParams.parse(request.query);
    return this.jobOpeningsQueryService.listJobOpenings(params);
  }

  @Api(server.route.getJobFilters)
  @NoCache()
  async getJobFilters(@Req() request: Request) {
    const params = JobsListQueryParams.parse(request.query);
    return this.jobOpeningsQueryService.getFilters(params);
  }

  @Api(server.route.getReferralDraft)
  @UseGuards(UserAuthValidateGuard)
  @NoCache()
  async getReferralDraft(@Req() request: Request & { userEmail?: string }) {
    const { referredMemberUid } = this.parse(JobReferralDraftQuerySchema, request.query);
    return this.jobOpeningsReferralService.getReferralDraft(request.params.uid, request.userEmail, referredMemberUid);
  }

  @Api(server.route.referJob)
  @UseGuards(UserAuthValidateGuard)
  @NoCache()
  async referJob(@Req() request: Request & { userEmail?: string }) {
    const input = this.parse(CreateJobReferralSchema, request.body);
    return this.jobOpeningsReferralService.referJob(request.params.uid, request.userEmail, input);
  }

  // Schema.parse() throws a raw ZodError, which the global exception filter
  // doesn't recognize as an HttpException — it falls through to a generic
  // 500 instead of a 400. Route contract-schema parsing through here so
  // invalid input surfaces as a proper 400.
  private parse<T>(schema: ZodType<T, any, any>, data: unknown): T {
    try {
      return schema.parse(data);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException(err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      }
      throw err;
    }
  }
}
