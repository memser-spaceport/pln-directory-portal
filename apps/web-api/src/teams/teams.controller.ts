import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { Team } from '@prisma/client';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiTeams } from 'libs/contracts/src/lib/contract-team';
import { CreateTeamSchemaDto } from 'libs/contracts/src/schema';
import { TeamsService } from './teams.service';

const server = initNestServer(apiTeams);

@Controller({
  version: '1',
})
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post('teams')
  create(@Body() createTeamDto: CreateTeamSchemaDto): Promise<Team> {
    return this.teamsService.create(createTeamDto);
  }

  @Get('teams:uid')
  findOne(@Param('uid') uid: string): Promise<Team | null> {
    return this.teamsService.findOne({ uid });
  }

  @Api(server.route.getTeams)
  findAll() {
    const teams = this.teamsService.findAll();
    return teams;
  }

  @Post('teams:uid')
  update(
    @Param('uid') uid: string,
    @Body() updateTeamDto: CreateTeamSchemaDto
  ): Promise<Team | null> {
    return this.teamsService.update(updateTeamDto, { uid: uid });
  }

  @Delete('teams:uid')
  delete(@Param('uid') uid: string): Promise<Team | null> {
    return this.teamsService.delete({ uid: uid });
  }
}
