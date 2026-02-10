import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Patch,
  UseGuards,
  UsePipes,
  Req,
  CacheTTL,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { AdminAuthGuard, DemoDayAdminAuthGuard } from '../guards/admin-auth.guard';
import { DemoDaysService } from '../demo-days/demo-days.service';
import { DemoDayParticipantsService } from '../demo-days/demo-day-participants.service';
import { DemoDayTeamLeadRequestsService } from '../demo-days/demo-day-team-lead-requests.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { DemoDayStatus } from '@prisma/client';
import {
  CreateDemoDayDto,
  UpdateDemoDayDto,
  AddParticipantDto,
  AddParticipantsBulkDto,
  GetParticipantsQueryDto,
  UpdateParticipantDto,
  ResponseDemoDayDto,
  ResponseParticipantDto,
  ResponseBulkParticipantsDto,
  ResponseParticipantsListDto,
  AddDashboardWhitelistMemberDto,
  DashboardWhitelistMemberDto,
  GetTeamLeadRequestsQueryDto,
  ReviewTeamLeadRequestDto,
  ResponseTeamLeadRequestsListDto,
} from 'libs/contracts/src/schema/admin-demo-day';
import { NoCache } from '../decorators/no-cache.decorator';
import { QueryCache } from '../decorators/query-cache.decorator';

@ApiTags('Admin Demo Days')
@Controller('v1/admin/demo-days')
export class AdminDemoDaysController {
  constructor(
    private readonly demoDaysService: DemoDaysService,
    private readonly demoDayParticipantsService: DemoDayParticipantsService,
    private readonly demoDayTeamLeadRequestsService: DemoDayTeamLeadRequestsService,
    private readonly notificationServiceClient: NotificationServiceClient
  ) { }

  @Get('subscribers')
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async getDemoDaySubscribers() {
    const [subscribers, notificationSettings] = await Promise.all([
      this.notificationServiceClient.listEventSubscribers({ eventType: 'DEMO_DAY' }),
      this.notificationServiceClient.getAllNotificationSettings(),
    ]);

    const disabledMemberIds = new Set(
      notificationSettings
        .filter((setting: any) => setting.memberId && setting.demoDaySubscriptionEnabled === false)
        .map((setting: any) => setting.memberId)
    );

    return subscribers.filter((subscriber: any) => {
      const memberId = subscriber.memberId || subscriber.memberUid;
      if (!memberId) {
        return true;
      }
      return !disabledMemberIds.has(memberId);
    });
  }

  @Post()
  @UseGuards(AdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @QueryCache()
  @CacheTTL(120) // 2 minutes
  async createDemoDay(@Req() req, @Body() body: CreateDemoDayDto): Promise<ResponseDemoDayDto> {
    return this.demoDaysService.createDemoDay(
      {
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        title: body.title,
        slugURL: body.slugURL,
        description: body.description,
        shortDescription: body.shortDescription,
        approximateStartDate: body.approximateStartDate,
        supportEmail: body.supportEmail,
        host: body.host,
        status: body.status.toUpperCase() as DemoDayStatus,
      },
      req.userEmail
    );
  }

  @Get()
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async getAllDemoDays(@Req() req): Promise<ResponseDemoDayDto[]> {
    // req.user contains the JWT payload with roles and memberUid
    const userRoles: string[] = req.user?.roles ?? [];
    const memberUid: string | undefined = req.user?.memberUid;
    return this.demoDaysService.getAllDemoDaysForAdmin(userRoles, memberUid);
  }

  // This endpoint uses slugURL for browser-friendly URLs (e.g., /demo-days/crypto-day)
  @Get(':slugURL')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getDemoDayDetails(@Param('slugURL') slugURL: string): Promise<ResponseDemoDayDto> {
    return this.demoDaysService.getDemoDayBySlugURL(slugURL);
  }

  @Post(':slugURL/preview-notification')
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async previewNotification(
    @Param('slugURL') slugURL: string,
    @Body() body: { status: string; notificationsEnabled: boolean }
  ): Promise<{ willSend: boolean; title?: string; description?: string; reason?: string }> {
    return this.demoDaysService.previewStatusNotification(
      slugURL,
      body.status?.toUpperCase() as DemoDayStatus,
      body.notificationsEnabled
    );
  }

  @Patch(':uid')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateDemoDay(
    @Req() req,
    @Param('uid') uid: string,
    @Body() body: UpdateDemoDayDto
  ): Promise<ResponseDemoDayDto> {
    return this.demoDaysService.updateDemoDay(
      uid,
      {
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        title: body.title,
        slugURL: body.slugURL,
        description: body.description,
        shortDescription: body.shortDescription,
        approximateStartDate: body.approximateStartDate,
        supportEmail: body.supportEmail,
        status: body.status?.toUpperCase() as DemoDayStatus,
        host: body.host,
        notificationsEnabled: body.notificationsEnabled,
        notifyBeforeStartHours: body.notifyBeforeStartHours,
        notifyBeforeEndHours: body.notifyBeforeEndHours,
        dashboardEnabled: body.dashboardEnabled,
      },
      req.userEmail
    );
  }

  @Post(':uid/participants')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async addParticipant(
    @Req() req,
    @Param('uid') demoDayUid: string,
    @Body() body: AddParticipantDto
  ): Promise<ResponseParticipantDto> {
    return this.demoDayParticipantsService.addParticipant(
      demoDayUid,
      {
        memberUid: body.memberUid,
        email: body.email,
        name: body.name,
        type: body.type.toUpperCase() as 'INVESTOR' | 'FOUNDER',
      },
      req.userEmail
    );
  }

  @Post(':uid/participants-bulk')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  async addInvestorParticipantsBulk(
    @Req() req,
    @Param('uid') demoDayUid: string,
    @Body() body: AddParticipantsBulkDto
  ): Promise<ResponseBulkParticipantsDto> {
    return this.demoDayParticipantsService.addInvestorParticipantsBulk(
      demoDayUid,
      {
        participants: body.participants,
      },
      req.userEmail
    );
  }

  @Get(':uid/participants')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getParticipants(
    @Param('uid') demoDayUid: string,
    @Query() query: GetParticipantsQueryDto
  ): Promise<ResponseParticipantsListDto> {
    return this.demoDayParticipantsService.getParticipants(demoDayUid, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      type: query.type,
      search: query.search,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Patch(':demoDayUid/participants/:participantUid')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateParticipant(
    @Req() req,
    @Param('demoDayUid') demoDayUid: string,
    @Param('participantUid') participantUid: string,
    @Body() body: UpdateParticipantDto
  ): Promise<ResponseParticipantDto> {
    return this.demoDayParticipantsService.updateParticipant(
      demoDayUid,
      participantUid,
      {
        status: body.status?.toUpperCase() as 'INVITED' | 'ENABLED' | 'DISABLED',
        teamUid: body.teamUid,
        type: body.type?.toUpperCase() as 'INVESTOR' | 'FOUNDER',
        hasEarlyAccess: body.hasEarlyAccess,
        isDemoDayAdmin: body.isDemoDayAdmin,
      },
      req.userEmail
    );
  }

  // Dashboard Whitelist Endpoints

  @Get(':uid/dashboard-whitelist')
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async getDashboardWhitelist(@Param('uid') uid: string): Promise<DashboardWhitelistMemberDto[]> {
    return this.demoDaysService.getDashboardWhitelist(uid);
  }

  @Post(':uid/dashboard-whitelist')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async addToDashboardWhitelist(
    @Param('uid') uid: string,
    @Body() body: AddDashboardWhitelistMemberDto
  ): Promise<{ success: boolean }> {
    return this.demoDaysService.addToDashboardWhitelist(uid, body.memberUid);
  }

  @Delete(':uid/dashboard-whitelist/:memberUid')
  @UseGuards(DemoDayAdminAuthGuard)
  @NoCache()
  async removeFromDashboardWhitelist(
    @Param('uid') uid: string,
    @Param('memberUid') memberUid: string
  ): Promise<{ success: boolean }> {
    return this.demoDaysService.removeFromDashboardWhitelist(uid, memberUid);
  }

  // Team Lead Requests

  @Get(':uid/team-lead-requests')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getTeamLeadRequests(
    @Param('uid') demoDayUid: string,
    @Query() query: GetTeamLeadRequestsQueryDto
  ): Promise<ResponseTeamLeadRequestsListDto> {
    return this.demoDayTeamLeadRequestsService.getRequests(demoDayUid, {
      page: query.page,
      limit: query.limit,
      status: query.status,
      search: query.search,
    });
  }

  @Patch(':demoDayUid/team-lead-requests/:participantUid')
  @UseGuards(DemoDayAdminAuthGuard)
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async reviewTeamLeadRequest(
    @Req() req,
    @Param('demoDayUid') demoDayUid: string,
    @Param('participantUid') participantUid: string,
    @Body() body: ReviewTeamLeadRequestDto
  ) {
    return this.demoDayTeamLeadRequestsService.reviewRequest(
      demoDayUid,
      participantUid,
      body.action,
      req.userEmail
    );
  }
}
