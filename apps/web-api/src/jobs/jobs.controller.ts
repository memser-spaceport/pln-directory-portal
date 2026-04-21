import { Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiJobs } from 'libs/contracts/src/lib/contract-jobs';
import { JobsListQueryParams } from 'libs/contracts/src/schema/job-opening';
import { NoCache } from '../decorators/no-cache.decorator';
import { JobsService } from './jobs.service';

const server = initNestServer(apiJobs);

@Controller()
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Api(server.route.getJobs)
  @NoCache()
  async getJobs(@Req() request: Request) {
    const params = JobsListQueryParams.parse(request.query);
    return this.jobsService.listJobs(params);
  }

  @Api(server.route.getJobFilters)
  @NoCache()
  async getJobFilters(@Req() request: Request) {
    const params = JobsListQueryParams.parse(request.query);
    return this.jobsService.getFilters(params);
  }
}
