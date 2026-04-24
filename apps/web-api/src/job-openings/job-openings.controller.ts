import { Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiJobOpenings } from 'libs/contracts/src/lib/contract-job-openings';
import { JobsListQueryParams } from 'libs/contracts/src/schema/job-opening';
import { NoCache } from '../decorators/no-cache.decorator';
import { JobOpeningsQueryService } from './job-openings-query.service';

const server = initNestServer(apiJobOpenings);

@Controller()
export class JobOpeningsController {
  constructor(private readonly jobOpeningsQueryService: JobOpeningsQueryService) {}

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
}
