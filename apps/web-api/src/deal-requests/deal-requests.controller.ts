import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { CreateDealRequestDto } from './deal-requests.dto';
import { DealRequestsService } from './deal-requests.service';

@Controller('v1/deals')
export class DealRequestsController {
  constructor(private readonly dealRequestsService: DealRequestsService) {}

  @UseGuards(UserTokenCheckGuard)
  @Post('requests')
  async createWithoutParam(
    @Req() req: Request,
    @Body() body: CreateDealRequestDto,
  ) {
    return this.dealRequestsService.create((req as any)['userUid'], undefined, body);
  }

  @UseGuards(UserTokenCheckGuard)
  @Post(':dealUid/requests')
  async createWithParam(
    @Req() req: Request,
    @Param('dealUid') dealUid: string,
    @Body() body: CreateDealRequestDto,
  ) {
    return this.dealRequestsService.create((req as any)['userUid'], dealUid, body);
  }
}
