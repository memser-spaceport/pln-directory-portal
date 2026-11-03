import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { TeamPitchStatus } from '@prisma/client';
import { TeamPitchAdminAuthGuard } from '../guards/admin-auth.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { SpvSpotlightAdminService } from '../spv-spotlights/spv-spotlight-admin.service';
import { SpvSpotlightInvestorListsService } from '../spv-spotlights/spv-spotlight-investor-lists.service';
import {
  AddSpvParticipantDto,
  AddSpvParticipantsBulkDto,
  CreateSpvInvestorListDto,
  CreateSpvSpotlightDto,
  GetSpvParticipantsQueryDto,
  GetSpvSpotlightsQueryDto,
  RemoveSpvParticipantsBulkDto,
  SendSpvBulkDto,
  SendSpvOpenNoticeDto,
  UpdateSpvEmailTemplatesDto,
  UpdateSpvInvestorListDto,
  UpdateSpvParticipantDto,
  UpdateSpvSpotlightDto,
} from 'libs/contracts/src/schema/spv-spotlight';

@ApiTags('Admin SPV Spotlights')
@Controller('v1/admin/spv-spotlights')
@UseGuards(TeamPitchAdminAuthGuard)
export class AdminSpvSpotlightController {
  constructor(
    private readonly adminService: SpvSpotlightAdminService,
    private readonly investorListsService: SpvSpotlightInvestorListsService
  ) {}

  @Get()
  @NoCache()
  async list(@Query() query: GetSpvSpotlightsQueryDto) {
    return this.adminService.list({
      search: query.search,
      status: query.status as TeamPitchStatus | undefined,
    });
  }

  @Post()
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async create(@Body() body: CreateSpvSpotlightDto) {
    return this.adminService.create(body);
  }

  @Get(':uid/access-requests')
  @NoCache()
  async listAccessRequests(@Param('uid') uid: string) {
    return this.adminService.listAccessRequests(uid);
  }

  @Post(':uid/access-requests/:requestUid/approve')
  @NoCache()
  async approve(@Param('uid') uid: string, @Param('requestUid') requestUid: string) {
    return this.adminService.approveAccessRequest(uid, requestUid);
  }

  @Post(':uid/access-requests/:requestUid/reject')
  @NoCache()
  async reject(@Param('uid') uid: string, @Param('requestUid') requestUid: string) {
    return this.adminService.rejectAccessRequest(uid, requestUid);
  }

  @Get(':uid/open-notice')
  @NoCache()
  async openNoticePreview(@Param('uid') uid: string) {
    return this.adminService.openNoticePreview(uid);
  }

  @Post(':uid/open-notice')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async sendOpenNotice(@Param('uid') uid: string, @Body() body: SendSpvOpenNoticeDto) {
    return this.adminService.sendOpenNotice(uid, body.includeAlreadySent ?? false, body.participantUids, {
      useDefaultSender: body.useDefaultSender,
      senderEmails: body.senderEmails,
      emailsPerSenderPerMinute: body.emailsPerSenderPerMinute,
    });
  }

  @Get(':uid/login-links')
  @NoCache()
  async exportLoginLinks(@Param('uid') uid: string) {
    return this.adminService.exportLoginLinks(uid);
  }

  @Patch(':uid/email-templates')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateTemplates(@Param('uid') uid: string, @Body() body: UpdateSpvEmailTemplatesDto) {
    return this.adminService.updateTemplates(uid, body.templates);
  }

  @Get(':uid/participants')
  @NoCache()
  async listParticipants(@Param('uid') uid: string, @Query() query: GetSpvParticipantsQueryDto) {
    return this.adminService.listParticipants(uid, query.type);
  }

  @Post(':uid/participants')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async addParticipant(@Param('uid') uid: string, @Body() body: AddSpvParticipantDto) {
    return this.adminService.addParticipant(uid, body);
  }

  @Post(':uid/participants-bulk')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async addBulk(@Param('uid') uid: string, @Body() body: AddSpvParticipantsBulkDto) {
    return this.adminService.addParticipantsBulk(uid, body.cohort, body.participants);
  }

  @Post(':uid/participants/send-invites-bulk')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async sendInvites(@Param('uid') uid: string, @Body() body: SendSpvBulkDto) {
    return this.adminService.sendInvites(uid, body.includeAlreadyInvited ?? false, body.participantUids, {
      useDefaultSender: body.useDefaultSender,
      senderEmails: body.senderEmails,
      emailsPerSenderPerMinute: body.emailsPerSenderPerMinute,
    });
  }

  @Post(':uid/participants/send-follow-ups-bulk')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async sendFollowUps(@Param('uid') uid: string, @Body() body: SendSpvBulkDto) {
    return this.adminService.sendFollowUps(uid, body.includeAlreadyFollowedUp ?? false, body.participantUids, {
      useDefaultSender: body.useDefaultSender,
      senderEmails: body.senderEmails,
      emailsPerSenderPerMinute: body.emailsPerSenderPerMinute,
    });
  }

  @Post(':uid/participants/remove-bulk')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async removeBulk(@Param('uid') uid: string, @Body() body: RemoveSpvParticipantsBulkDto) {
    return this.adminService.removeParticipantsBulk(uid, body.participantUids);
  }

  @Patch(':uid/participants/:participantUid')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateParticipant(
    @Param('uid') uid: string,
    @Param('participantUid') participantUid: string,
    @Body() body: UpdateSpvParticipantDto
  ) {
    return this.adminService.updateParticipant(uid, participantUid, body);
  }

  @Delete(':uid/participants/:participantUid')
  @NoCache()
  async removeParticipant(@Param('uid') uid: string, @Param('participantUid') participantUid: string) {
    return this.adminService.removeParticipant(uid, participantUid);
  }

  @Get(':uid/investor-lists')
  @NoCache()
  async listInvestorLists(@Param('uid') uid: string) {
    return this.investorListsService.list(uid);
  }

  @Post(':uid/investor-lists')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async createInvestorList(@Param('uid') uid: string, @Body() body: CreateSpvInvestorListDto) {
    return this.investorListsService.create(uid, body);
  }

  @Patch(':uid/investor-lists/:listUid')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateInvestorList(
    @Param('uid') uid: string,
    @Param('listUid') listUid: string,
    @Body() body: UpdateSpvInvestorListDto
  ) {
    return this.investorListsService.update(uid, listUid, body);
  }

  @Delete(':uid/investor-lists/:listUid')
  @NoCache()
  async deleteInvestorList(@Param('uid') uid: string, @Param('listUid') listUid: string) {
    return this.investorListsService.delete(uid, listUid);
  }

  @Get(':uid')
  @NoCache()
  async getDetail(@Param('uid') uid: string) {
    return this.adminService.getDetail(uid);
  }

  @Patch(':uid')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async update(@Param('uid') uid: string, @Body() body: UpdateSpvSpotlightDto) {
    return this.adminService.update(uid, body);
  }
}
