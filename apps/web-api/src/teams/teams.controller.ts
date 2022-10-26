import { Controller } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiTeam } from 'libs/contracts/src/lib/contract-team';
import { TeamsService } from './teams.service';

const server = initNestServer(apiTeam);
type RouteShape = typeof server.routeShapes;
@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Api(server.route.getTeams)
  findAll() {
    return this.teamsService.findAll();
  }

  @Api(server.route.getTeam)
  @ApiParam({ name: 'uid', type: 'string' })
  findOne(@ApiDecorator() { params: { uid } }: RouteShape['getTeam']) {
    return this.teamsService.findOne(uid);
  }
}
