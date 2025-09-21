import { Body, Controller, Get, Param, Post, Query, Patch, UseGuards, UsePipes } from '@nestjs/common';
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
  @NoCache()
  async createDemoDay(@Body() body: CreateDemoDayDto): Promise<ResponseDemoDayDto> {
    return this.demoDaysService.createDemoDay({
      startDate: new Date(body.startDate),
      title: body.title,
      description: body.description,
      status: body.status.toUpperCase() as DemoDayStatus,
    });
  }

  @Get()
  @NoCache()
  async getAllDemoDays(): Promise<ResponseDemoDayDto[]> {
    return this.demoDaysService.getAllDemoDays();
  }

  @Get(':uid')
  @NoCache()
  async getDemoDayDetails(@Param('uid') uid: string): Promise<ResponseDemoDayDto> {
    return this.demoDaysService.getDemoDayByUid(uid);
  }

  @Patch(':uid')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateDemoDay(@Param('uid') uid: string, @Body() body: UpdateDemoDayDto): Promise<ResponseDemoDayDto> {
    return this.demoDaysService.updateDemoDay(uid, {
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      title: body.title,
      description: body.description,
      status: body.status?.toUpperCase() as DemoDayStatus,
    });
  }

  @Post(':uid/participants')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async addParticipant(
    @Param('uid') demoDayUid: string,
    @Body() body: AddParticipantDto
  ): Promise<ResponseParticipantDto> {
    return this.demoDayParticipantsService.addParticipant(demoDayUid, {
      memberUid: body.memberUid,
      email: body.email,
      name: body.name,
      type: body.type.toUpperCase() as 'INVESTOR' | 'FOUNDER',
    });
  }

  @Post(':uid/participants-bulk')
  @UsePipes(ZodValidationPipe)
  async addParticipantsBulk(
    @Param('uid') demoDayUid: string,
    @Body() body: AddParticipantsBulkDto
  ): Promise<ResponseBulkParticipantsDto> {
    return this.demoDayParticipantsService.addParticipantsBulk(demoDayUid, {
      participants: body.participants,
      type: body.type.toUpperCase() as 'INVESTOR' | 'FOUNDER',
    });
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
    @Param('demoDayUid') demoDayUid: string,
    @Param('participantUid') participantUid: string,
    @Body() body: UpdateParticipantDto
  ): Promise<ResponseParticipantDto> {
    return this.demoDayParticipantsService.updateParticipant(demoDayUid, participantUid, {
      status: body.status?.toUpperCase() as 'INVITED' | 'ENABLED' | 'DISABLED',
      teamUid: body.teamUid,
    });
  }
}
