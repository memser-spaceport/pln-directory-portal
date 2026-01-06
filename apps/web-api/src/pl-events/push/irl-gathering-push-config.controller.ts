import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../guards/admin-auth.guard';
import {
  CreateIrlGatheringPushConfigDto,
  IrlGatheringPushConfigService,
  UpdateIrlGatheringPushConfigDto,
} from './irl-gathering-push-config.service';

@Controller('/v1/admin/irl-push-config')
@UseGuards(AdminAuthGuard)
export class IrlGatheringPushConfigController {
  constructor(private readonly service: IrlGatheringPushConfigService) {}

  @Get()
  async getActive() {
    return this.service.getActiveConfigOrThrow();
  }

  @Patch(':uid')
  async update(@Param('uid') uid: string, @Body() body: UpdateIrlGatheringPushConfigDto) {
    return this.service.updateByUid(uid, body);
  }

  @Post()
  async createAndActivate(@Body() body: CreateIrlGatheringPushConfigDto) {
    return this.service.createAndActivate(body);
  }

  @Post(':uid/activate')
  async activate(@Param('uid') uid: string) {
    return this.service.activate(uid);
  }
}
