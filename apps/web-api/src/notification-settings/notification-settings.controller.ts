import { ApiTags } from '@nestjs/swagger';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { NoCache } from '../decorators/no-cache.decorator';
import { NotificationSettingsService } from './notification-settings.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import {
  NotificationSettingsResponse,
  UpdateNotificationSettingsDto,
  UpdateParticipationDto,
  UpdateForumSettingsDto,
  CreateNotificationSettingItemDto,
  UpdateInvestorSettingsDto, InvestorSettingsResponse,
} from 'libs/contracts/src/schema/notification-settings';
import { MembersService } from '../members/members.service';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { NotificationServiceClient } from '../notifications/notification-service.client';

@ApiTags('NotificationSettings')
@UseGuards(UserTokenValidation)
@Controller('v1/notification/settings')
export class NotificationSettingsController {
  constructor(
    private notificationSettingsService: NotificationSettingsService,
    private memberService: MembersService,
    private notificationServiceClient: NotificationServiceClient
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

  @Get(':memberUid/forum')
  @NoCache()
  @UsePipes(ZodValidationPipe)
  async getForumSettings(@Param('memberUid') memberUid: string, @Req() request: Request) {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);
    if (authenticatedUser.uid !== memberUid) {
      throw new ForbiddenException(`User isn't authorized to get the settings`);
    }
    return this.notificationServiceClient.getNotificationSetting(memberUid);
  }

  @Put(':memberUid/forum')
  @UsePipes(ZodValidationPipe)
  async updateForumSettings(
    @Param('memberUid') memberUid: string,
    @Body() body: UpdateForumSettingsDto,
    @Req() request: Request
  ) {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);
    if (authenticatedUser.uid !== memberUid) {
      throw new ForbiddenException(`User isn't authorized to update the settings`);
    }
    return this.notificationServiceClient.upsertNotificationSetting(memberUid, {
      ...body,
      memberUid,
      memberExternalId: authenticatedUser.externalId,
    });
  }

  @Get(':memberUid/item/:type')
  @NoCache()
  async findItem(
    @Param('memberUid') memberUid: string,
    @Param('type') type: string,
    @Query('contextId') contextId: string,
    @Req() request: Request
  ) {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);
    if (authenticatedUser.uid !== memberUid) {
      throw new ForbiddenException(`User isn't authorized to get the item settings`);
    }
    return this.notificationServiceClient.findItem(memberUid, type, contextId);
  }

  @Put(':memberUid/item/:type')
  @UsePipes(ZodValidationPipe)
  async upsertItem(
    @Param('memberUid') memberUid: string,
    @Param('type') type: string,
    @Body() dto: CreateNotificationSettingItemDto,
    @Req() request: Request
  ) {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);
    if (authenticatedUser.uid !== memberUid) {
      throw new ForbiddenException(`User isn't authorized to update the item settings`);
    }
    return this.notificationServiceClient.upsertItem(memberUid, type, {
      ...dto,
      memberExternalId: authenticatedUser.externalId,
    });
  }

  @Get(':memberUid/investor')
  @NoCache()
  @UsePipes(ZodValidationPipe)
  async getInvestorSettings(
    @Param('memberUid') memberUid: string,
    @Req() request: Request
  ): Promise<InvestorSettingsResponse> {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);

    if (authenticatedUser.uid !== memberUid && !this.memberService.checkIfAdminUser(authenticatedUser)) {
      throw new ForbiddenException(`User isn't authorized to get the investor settings`);
    }

    const settings = await this.notificationServiceClient.getNotificationSetting(memberUid);

    return {
      memberUid,
      investorInvitesEnabled: !!settings?.investorInvitesEnabled,
      investorDealflowEnabled: !!settings?.investorDealflowEnabled,
    };
  }

  @Put(':memberUid/investor')
  @UsePipes(ZodValidationPipe)
  async updateInvestorSettings(
    @Param('memberUid') memberUid: string,
    @Body() body: UpdateInvestorSettingsDto,
    @Req() request: Request
  ) {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);

    const isSelf = authenticatedUser.uid === memberUid;
    const isAdmin = this.memberService.checkIfAdminUser(authenticatedUser);
    const isInvestor = authenticatedUser?.accessLevel && (authenticatedUser.accessLevel === 'L5' || authenticatedUser.accessLevel === 'L6')

    if (!((isSelf && isInvestor) || isAdmin)) {
      throw new ForbiddenException(`User isn't authorized to update the investor settings`);
    }

    return this.notificationServiceClient.upsertNotificationSetting(memberUid, {
      ...body,
      memberUid,
      memberExternalId: authenticatedUser.externalId,
    });
  }
}
