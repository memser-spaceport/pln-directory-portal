import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Version,
} from '@nestjs/common';
import { Prisma, Team } from '@prisma/client';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Version('1')
  @Post()
  create(@Body() createTeamDto: Prisma.TeamCreateInput): Promise<Team> {
    return this.teamsService.create(createTeamDto);
  }

  @Version('1')
  @Get(':uid')
  findOne(@Param('uid') uid: string): Promise<Team> {
    return this.teamsService.findOne({ uid });
  }

  @Version('1')
  @Get()
  findAll(): Promise<Team[]> {
    return this.teamsService.findAll();
  }

  @Version('1')
  @Post(':uid')
  update(
    @Param('uid') uid: string,
    @Body() updateTeamDto: UpdateTeamDto
  ): Promise<Team> {
    return this.teamsService.update(updateTeamDto, { uid: uid });
  }

  @Version('1')
  @Delete(':uid')
  delete(@Param('uid') uid: string): Promise<Team> {
    return this.teamsService.delete({ uid: uid });
  }
}
