import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { DealsService } from './deals.service';
import { ListDealsQueryDto, ReportDealIssueDto, SubmitDealDto } from './deals.dto';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';

@Controller('v1/deals')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  @Get('access')
  async access(@Req() req: Request) {
    return {
      canAccessDeals: await this.dealsService.canAccessDeals(req['userEmail']),
    };
  }

  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  @Get()
  async list(@Req() req: Request, @Query() query: ListDealsQueryDto) {
    return this.dealsService.listForUser(req['userEmail'], query);
  }

  @UseGuards(UserTokenCheckGuard)
  @Post('submissions')
  async submitDeal(@Req() req: Request, @Body() body: SubmitDealDto) {
    return this.dealsService.submitDeal(req['userEmail'], body);
  }

  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  @Get(':uid')
  async getOne(@Req() req: Request, @Param('uid') uid: string) {
    return this.dealsService.getForUser(req['userEmail'], uid);
  }

  @UseGuards(UserTokenCheckGuard)
  @Post(':uid/redeem')
  async redeem(@Req() req: Request, @Param('uid') uid: string) {
    return this.dealsService.redeem(req['userEmail'], uid);
  }

  @UseGuards(UserTokenCheckGuard)
  @Post(':uid/using')
  async markUsing(@Req() req: Request, @Param('uid') uid: string) {
    return this.dealsService.markUsing(req['userEmail'], uid);
  }

  @UseGuards(UserTokenCheckGuard)
  @Delete(':uid/using')
  async unmarkUsing(@Req() req: Request, @Param('uid') uid: string) {
    return this.dealsService.unmarkUsing(req['userEmail'], uid);
  }

  @UseGuards(UserTokenCheckGuard)
  @Post(':uid/issues')
  async reportIssue(
    @Req() req: Request,
    @Param('uid') uid: string,
    @Body() body: ReportDealIssueDto,
  ) {
    return this.dealsService.reportIssue(req['userEmail'], uid, body);
  }
}
