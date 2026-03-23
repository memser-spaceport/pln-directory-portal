import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { DealsService } from './deals.service';
import {
  ListDealIssuesQueryDto,
  ListDealsQueryDto,
  ListDealSubmissionsQueryDto,
  UpdateDealAccessDto,
  UpdateDealIssueDto,
  UpdateDealSubmissionDto,
  UpsertDealDto,
} from './deals.dto';
import { NoCache } from '../decorators/no-cache.decorator';

@Controller('v1/admin/deals')
@UseGuards(AdminAuthGuard)
export class AdminDealsController {
  constructor(private readonly dealsService: DealsService) {}

  @NoCache()
  @Get()
  async list(@Query() query: ListDealsQueryDto) {
    return this.dealsService.adminList(query);
  }

  @NoCache()
  @Get('whitelist')
  async whitelist() {
    return this.dealsService.getWhitelist();
  }

  @Post('whitelist')
  async addWhitelist(@Body() body: UpdateDealAccessDto) {
    return this.dealsService.addToWhitelist(body.memberUid);
  }

  @Delete('whitelist/:memberUid')
  async removeWhitelist(@Param('memberUid') memberUid: string) {
    return this.dealsService.removeFromWhitelist(memberUid);
  }

  @NoCache()
  @Get('submissions')
  async listSubmissions(@Query() query: ListDealSubmissionsQueryDto) {
    return this.dealsService.adminListSubmissions(query);
  }

  @NoCache()
  @Get('submissions/:uid')
  async getSubmission(@Param('uid') uid: string) {
    return this.dealsService.adminGetSubmission(uid);
  }

  @Patch('submissions/:uid')
  async updateSubmission(@Param('uid') uid: string, @Body() body: UpdateDealSubmissionDto) {
    return this.dealsService.adminUpdateSubmission(uid, body);
  }

  @NoCache()
  @Get('issues')
  async listIssues(@Query() query: ListDealIssuesQueryDto) {
    return this.dealsService.adminListIssues(query);
  }

  @NoCache()
  @Get('issues/:uid')
  async getIssue(@Param('uid') uid: string) {
    return this.dealsService.adminGetIssue(uid);
  }


  @Patch('issues/:uid')
  async updateIssue(
    @Req() req: Request,
    @Param('uid') uid: string,
    @Body() body: UpdateDealIssueDto,
  ) {
    const memberUid = (req as any).user?.memberUid;
    return this.dealsService.adminUpdateIssue(uid, body, memberUid);
  }

  @NoCache()
  @Get(':uid')
  async getOne(@Param('uid') uid: string) {
    return this.dealsService.adminGetByUid(uid);
  }

  @Post()
  async create(@Body() body: UpsertDealDto) {
    return this.dealsService.adminCreate(body);
  }

  @Patch(':uid')
  async update(@Param('uid') uid: string, @Body() body: UpsertDealDto) {
    return this.dealsService.adminUpdate(uid, body);
  }
}
