import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UsePipes } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { TeamPitchAdminAuthGuard } from '../guards/admin-auth.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { TeamPitchesService } from '../team-pitches/team-pitches.service';
import { TeamPitchParticipantsService } from '../team-pitches/team-pitch-participants.service';
import {
  AddTeamPitchParticipantDto,
  AddTeamPitchParticipantsBulkDto,
  CreateTeamPitchDto,
  GetTeamPitchParticipantsQueryDto,
  GetTeamPitchesQueryDto,
  RemoveTeamPitchParticipantsBulkDto,
  SendTeamPitchInvitesBulkDto,
  UpdateTeamPitchDto,
  UpdateTeamPitchParticipantDto,
} from 'libs/contracts/src/schema/admin-team-pitch';
import { TeamPitchStatus } from '@prisma/client';

@ApiTags('Admin Team Pitches')
@Controller('v1/admin/team-pitches')
@UseGuards(TeamPitchAdminAuthGuard)
export class AdminTeamPitchController {
  constructor(
    private readonly teamPitchesService: TeamPitchesService,
    private readonly teamPitchParticipantsService: TeamPitchParticipantsService
  ) {}

  @Get()
  @NoCache()
  async list(@Query() query: GetTeamPitchesQueryDto) {
    return this.teamPitchesService.listPitches({
      search: query.search,
      status: query.status as TeamPitchStatus | undefined,
    });
  }

  @Post()
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async create(@Body() body: CreateTeamPitchDto) {
    return this.teamPitchesService.createPitch({
      teamUid: body.teamUid,
      title: body.title,
      description: body.description,
      slug: body.slug,
      status: body.status as TeamPitchStatus | undefined,
      supportEmail: body.supportEmail,
      headerImageUid: body.headerImageUid,
      logoUid: body.logoUid,
      primaryColor: body.primaryColor,
    });
  }

  @Get(':pitchUid')
  @NoCache()
  async getDetail(@Param('pitchUid') pitchUid: string) {
    return this.teamPitchesService.getPitchDetail(pitchUid);
  }

  @Patch(':pitchUid')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async update(@Param('pitchUid') pitchUid: string, @Body() body: UpdateTeamPitchDto) {
    return this.teamPitchesService.updatePitch(pitchUid, {
      title: body.title,
      description: body.description,
      spotlightFrequency: body.spotlightFrequency,
      spotlightStatement: body.spotlightStatement,
      slug: body.slug,
      status: body.status as TeamPitchStatus | undefined,
      supportEmail: body.supportEmail,
      headerImageUid: body.headerImageUid,
      logoUid: body.logoUid,
      primaryColor: body.primaryColor,
    });
  }

  @Get(':pitchUid/participants')
  @NoCache()
  async listParticipants(@Param('pitchUid') pitchUid: string, @Query() query: GetTeamPitchParticipantsQueryDto) {
    return this.teamPitchParticipantsService.listParticipants(pitchUid, query.type);
  }

  @Post(':pitchUid/participants')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async addParticipant(@Param('pitchUid') pitchUid: string, @Body() body: AddTeamPitchParticipantDto) {
    return this.teamPitchParticipantsService.addParticipant(pitchUid, body);
  }

  @Post(':pitchUid/participants-bulk')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async addInvestorParticipantsBulk(
    @Param('pitchUid') pitchUid: string,
    @Body() body: AddTeamPitchParticipantsBulkDto
  ) {
    return this.teamPitchParticipantsService.addInvestorParticipantsBulk(pitchUid, body);
  }

  @Post(':pitchUid/participants/send-invites-bulk')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async sendInvitesBulk(@Param('pitchUid') pitchUid: string, @Body() body: SendTeamPitchInvitesBulkDto) {
    return this.teamPitchParticipantsService.sendInvestorInvitesBulk(pitchUid, {
      includeAlreadyInvited: body.includeAlreadyInvited ?? false,
      participantUids: body.participantUids,
    });
  }

  @Post(':pitchUid/participants/remove-bulk')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async removeParticipantsBulk(@Param('pitchUid') pitchUid: string, @Body() body: RemoveTeamPitchParticipantsBulkDto) {
    return this.teamPitchParticipantsService.removeParticipantsBulk(pitchUid, body.participantUids);
  }

  @Patch(':pitchUid/participants/:participantUid')
  @UsePipes(ZodValidationPipe)
  @NoCache()
  async updateParticipant(
    @Param('pitchUid') pitchUid: string,
    @Param('participantUid') participantUid: string,
    @Body() body: UpdateTeamPitchParticipantDto
  ) {
    return this.teamPitchParticipantsService.updateParticipant(pitchUid, participantUid, body);
  }

  @Delete(':pitchUid/participants/:participantUid')
  @NoCache()
  async removeParticipant(@Param('pitchUid') pitchUid: string, @Param('participantUid') participantUid: string) {
    return this.teamPitchParticipantsService.removeParticipant(pitchUid, participantUid);
  }

  @Post(':pitchUid/participants/:participantUid/send-invite')
  @NoCache()
  async sendInvite(@Param('pitchUid') pitchUid: string, @Param('participantUid') participantUid: string) {
    return this.teamPitchParticipantsService.sendInvestorInvite(pitchUid, participantUid);
  }
}
