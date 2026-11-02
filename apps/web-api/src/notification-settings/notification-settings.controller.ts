import { ApiTags } from '@nestjs/swagger';
import {
  BadRequestException,
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
  UpdateInvestorSettingsDto,
  InvestorSettingsResponse,
  UpdateDemoDaySubscriptionSettingsDto,
  DemoDaySubscriptionSettingsResponseDto,
  SuggestedCandidatesEmailSettingsResponseDto,
  UpdateSuggestedCandidatesEmailSettingsSchema,
} from 'libs/contracts/src/schema/notification-settings';
import { MembersService } from '../members/members.service';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { MEMBER_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { SuggestedCandidatesEmailPreferenceService } from './suggested-candidates-email-preference.service';

@ApiTags('NotificationSettings')
@UseGuards(UserTokenValidation)
@Controller('v1/notification/settings')
export class NotificationSettingsController {
  constructor(
    private notificationSettingsService: NotificationSettingsService,
    private memberService: MembersService,
    private notificationServiceClient: NotificationServiceClient,
    private accessControlV2Service: AccessControlV2Service,
    private suggestedCandidatesEmailPreference: SuggestedCandidatesEmailPreferenceService
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
    const investorPermission = await this.accessControlV2Service.hasPermission(
      authenticatedUser.uid,
      MEMBER_PERMISSIONS.INVESTOR_MANAGE
    );
    const isInvestor = investorPermission.allowed;

    if (!((isSelf && isInvestor) || isAdmin)) {
      throw new ForbiddenException(`User isn't authorized to update the investor settings`);
    }

    return this.notificationServiceClient.upsertNotificationSetting(memberUid, {
      ...body,
      memberUid,
      memberExternalId: authenticatedUser.externalId,
    });
  }

  @Get(':memberUid/demo-day-subscription')
  @NoCache()
  @UsePipes(ZodValidationPipe)
  async getDemoDaySubscriptionSettings(
    @Param('memberUid') memberUid: string,
    @Req() request: Request
  ): Promise<DemoDaySubscriptionSettingsResponseDto> {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);

    if (authenticatedUser.uid !== memberUid && !this.memberService.checkIfAdminUser(authenticatedUser)) {
      throw new ForbiddenException(`User isn't authorized to get the demo day subscription settings`);
    }

    const settings = await this.notificationServiceClient.getNotificationSetting(memberUid);

    return {
      memberUid,
      demoDaySubscriptionEnabled: !!settings?.demoDaySubscriptionEnabled,
    };
  }

  @Put(':memberUid/demo-day-subscription')
  @UsePipes(ZodValidationPipe)
  async updateDemoDaySubscriptionSettings(
    @Param('memberUid') memberUid: string,
    @Body() body: UpdateDemoDaySubscriptionSettingsDto,
    @Req() request: Request
  ) {
    const userEmail = request['userEmail'];
    const authenticatedUser = await this.memberService.findMemberFromEmail(userEmail);

    if (authenticatedUser.uid !== memberUid && !this.memberService.checkIfAdminUser(authenticatedUser)) {
      throw new ForbiddenException(`User isn't authorized to update the demo day subscription settings`);
    }

    const targetMember =
      authenticatedUser.uid === memberUid ? authenticatedUser : await this.memberService.findOne(memberUid);

    return this.notificationSettingsService.setDemoDaySubscription(
      { uid: memberUid, name: targetMember.name, email: targetMember.email },
      body.demoDaySubscriptionEnabled,
      authenticatedUser.externalId
    );
  }

  /** The weekly suggested-candidates email preference (LAB-2850), stored in the Directory database. */
  @Get(':memberUid/suggested-candidates-email')
  @NoCache()
  async getSuggestedCandidatesEmailSettings(
    @Param('memberUid') memberUid: string,
    @Req() request: Request
  ): Promise<SuggestedCandidatesEmailSettingsResponseDto> {
    const authenticatedUser = await this.memberService.findMemberFromEmail(request['userEmail']);
    if (authenticatedUser.uid !== memberUid && !this.memberService.checkIfAdminUser(authenticatedUser)) {
      throw new ForbiddenException(`User isn't authorized to get the suggested candidates email settings`);
    }
    return this.suggestedCandidatesEmailPreference.get(memberUid);
  }

  /** Body checked with `safeParse` and an explicit 400 (a thrown ZodError would surface as a 500). LAB-2850. */
  @Put(':memberUid/suggested-candidates-email')
  async updateSuggestedCandidatesEmailSettings(
    @Param('memberUid') memberUid: string,
    @Body() body: unknown,
    @Req() request: Request
  ): Promise<SuggestedCandidatesEmailSettingsResponseDto> {
    const authenticatedUser = await this.memberService.findMemberFromEmail(request['userEmail']);
    if (authenticatedUser.uid !== memberUid && !this.memberService.checkIfAdminUser(authenticatedUser)) {
      throw new ForbiddenException(`User isn't authorized to update the suggested candidates email settings`);
    }
    const parsed = UpdateSuggestedCandidatesEmailSettingsSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('suggestedCandidatesEmailEnabled must be a boolean');
    }
    return this.suggestedCandidatesEmailPreference.set(memberUid, parsed.data.suggestedCandidatesEmailEnabled);
  }
}
