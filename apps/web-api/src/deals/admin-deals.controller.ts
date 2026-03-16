import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { DealsService } from './deals.service';
import { ListDealsQueryDto, UpdateDealAccessDto, UpsertDealDto } from './deals.dto';
import {NoCache} from "../decorators/no-cache.decorator";

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
