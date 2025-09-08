import {Controller, Get, Param, Patch, Query, Body, UseGuards} from '@nestjs/common';
import {TeamFundraisingService} from "../team-fundraising/team-fundraising.service";
import {ChangeStatusDto, UpsertTeamFundraisingDto} from "../dto/upsert-team-fundraising.dto";
import {AdminAuthGuard} from "../../guards/admin-auth.guard";

@Controller('v1/admin/fundraising-profiles')
@UseGuards(AdminAuthGuard)
export class AdminTeamFundraisingController {
  constructor(private readonly service: TeamFundraisingService) {
  }

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: 'DISABLED' | 'DRAFT' | 'PUBLISHED',
    @Query('teamUid') teamUid?: string,
  ) {
    return this.service.listAsAdmin({
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100),
      status,
      teamUid,
    });
  }

  @Get(':uid')
  async getById(@Param('uid') uid: string) {
    return this.service.getByUidAsAdmin(uid);
  }

  @Patch(':uid')
  async updateById(@Param('uid') uid: string, @Body() body: UpsertTeamFundraisingDto & {
    status?: 'DISABLED' | 'DRAFT' | 'PUBLISHED'
  }) {
    return this.service.updateByUidAsAdmin(uid, body);
  }

  @Patch(':uid/status')
  async changeStatus(@Param('uid') uid: string, @Body() body: ChangeStatusDto) {
    return this.service.changeStatusAsAdmin(uid, body.status);
  }
}
