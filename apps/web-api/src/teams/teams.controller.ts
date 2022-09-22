import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Prisma, Team } from '@prisma/client';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@Controller({
  version: '1',
})
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post('teams')
  create(@Body() createTeamDto: Prisma.TeamCreateInput): Promise<Team> {
    return this.teamsService.create(createTeamDto);
  }

  @Get('teams:uid')
  findOne(@Param('uid') uid: string): Promise<Team> {
    return this.teamsService.findOne({ uid });
  }

  @Get('teams')
  findAll(): Promise<Team[]> {
    return this.teamsService.findAll();
  }

  @Post('teams:uid')
  update(
    @Param('uid') uid: string,
    @Body() updateTeamDto: UpdateTeamDto
  ): Promise<Team> {
    return this.teamsService.update(updateTeamDto, { uid: uid });
  }

  @Delete('teams:uid')
  delete(@Param('uid') uid: string): Promise<Team> {
    return this.teamsService.delete({ uid: uid });
  }
}
