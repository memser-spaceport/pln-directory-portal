import { Body, Controller, Get, Param, Post, Query, Patch, UseGuards, UsePipes, Req, CacheTTL } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { DemoDaysService } from '../demo-days/demo-days.service';
import { DemoDayParticipantsService } from '../demo-days/demo-day-participants.service';
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
} from 'libs/contracts/src/schema/admin-demo-day';
import { NoCache } from '../decorators/no-cache.decorator';
import { QueryCache } from '../decorators/query-cache.decorator';

@ApiTags('Admin Demo Days')
@Controller('v1/admin/demo-days')
@UseGuards(AdminAuthGuard)
export class AdminDemoDaysController {
  constructor(
    private readonly demoDaysService: DemoDaysService,
    private readonly demoDayParticipantsService: DemoDayParticipantsService
  ) {}

  @Post()
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
        status: body.status.toUpperCase() as DemoDayStatus,
      },
      req.userEmail
    );
  }

  @Get()
  @NoCache()
  async getAllDemoDays(): Promise<ResponseDemoDayDto[]> {
    return this.demoDaysService.getAllDemoDays();
  }

  // This endpoint uses slugURL for browser-friendly URLs (e.g., /demo-days/crypto-day)
  @Get(':slugURL')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async getDemoDayDetails(@Param('slugURL') slugURL: string): Promise<ResponseDemoDayDto> {
    return this.demoDaysService.getDemoDayBySlugURL(slugURL);
  }

  @Patch(':uid')
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
        description: body.description,
        shortDescription: body.shortDescription,
        status: body.status?.toUpperCase() as DemoDayStatus,
      },
      req.userEmail
    );
  }

  @Post(':uid/participants')
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
      },
      req.userEmail
    );
  }
}
