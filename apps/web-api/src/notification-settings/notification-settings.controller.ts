import { ApiTags } from '@nestjs/swagger';
import { Body, Controller, ForbiddenException, Get, Param, Patch, Put, Req, UseGuards, UsePipes } from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { NotificationSettingsService } from './notification-settings.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import {
  NotificationSettingsResponse,
  UpdateNotificationSettingsDto,
  UpdateParticipationDto,
} from 'libs/contracts/src/schema/notification-settings';
import { MembersService } from '../members/members.service';
import { ZodValidationPipe } from '@abitia/zod-dto';

@ApiTags('NotificationSettings')
@UseGuards(UserTokenValidation)
@Controller('v1/notification/settings')
export class NotificationSettingsController {
  constructor(
    private notificationSettingsService: NotificationSettingsService,
    private memberService: MembersService
  ) {}

  @Get(':memberUid')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getNotificationSettings(
    @Param('memberUid') memberUid: string,
    @Req() request: Request
  ): Promise<NotificationSettingsResponse> {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);
    if (authenticatedUser.uid !== memberUid) {
      throw new ForbiddenException(`User isn't authorized to get the settings`);
    }
    return this.notificationSettingsService.getNotificationSettings(memberUid);
  }

  @Patch(':memberUid')
  @UsePipes(ZodValidationPipe)
  async updateNotificationSettings(
    @Param('memberUid') memberUid: string,
    @Body() body: UpdateNotificationSettingsDto,
    @Req() request: Request
  ) {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);
    if (authenticatedUser.uid !== memberUid) {
      throw new ForbiddenException(`User isn't authorized to update the settings`);
    }
    await this.notificationSettingsService.updateOrCreateByMemberUid(memberUid, body);
  }

  @Put(':memberUid/participation')
  @UsePipes(ZodValidationPipe)
  async updateRecommendationsParticipation(
    @Param('memberUid') memberUid: string,
    @Body() body: UpdateParticipationDto,
    @Req() request: Request
  ) {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);
    if (!this.memberService.checkIfAdminUser(authenticatedUser)) {
      throw new ForbiddenException(`User isn't authorized to update the settings`);
    }
    await this.notificationSettingsService.updateParticipation(memberUid, body);
  }
}
