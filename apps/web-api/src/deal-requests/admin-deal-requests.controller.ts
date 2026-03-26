import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { DealRequestsService } from './deal-requests.service';
import { ListDealRequestsQueryDto, UpdateDealRequestDto } from './deal-requests.dto';

@Controller('v1/admin/deal-requests')
@UseGuards(AdminAuthGuard)
export class AdminDealRequestsController {
  constructor(private readonly dealRequestsService: DealRequestsService) {}

  @NoCache()
  @Get()
  async list(@Query() query: ListDealRequestsQueryDto) {
    return this.dealRequestsService.adminList(query);
  }

  @NoCache()
  @Get(':uid')
  async getOne(@Param('uid') uid: string) {
    return this.dealRequestsService.adminGetByUid(uid);
  }

  @Patch(':uid')
  async update(@Param('uid') uid: string, @Body() body: UpdateDealRequestDto) {
    return this.dealRequestsService.adminUpdate(uid, body);
  }
}
