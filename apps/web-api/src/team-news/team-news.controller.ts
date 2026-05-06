import { Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiTeamNews } from 'libs/contracts/src/lib/contract-team-news';
import { TeamNewsListQueryParams } from 'libs/contracts/src/schema/team-news';
import { NoCache } from '../decorators/no-cache.decorator';
import { TeamNewsQueryService } from './team-news-query.service';

const server = initNestServer(apiTeamNews);

@Controller()
export class TeamNewsController {
  constructor(private readonly teamNewsQueryService: TeamNewsQueryService) {}

  @Api(server.route.getTeamNews)
  @NoCache()
  async getTeamNews(@Req() request: Request) {
    const params = TeamNewsListQueryParams.parse(request.query);
    return this.teamNewsQueryService.listTeamNews(params);
  }

  @Api(server.route.getTeamNewsGrouped)
  @NoCache()
  async getTeamNewsGrouped(@Req() request: Request) {
    const params = TeamNewsListQueryParams.parse(request.query);
    return this.teamNewsQueryService.listGroupedByFocusArea(params);
  }

  @Api(server.route.getTeamNewsFilters)
  @NoCache()
  async getTeamNewsFilters(@Req() request: Request) {
    const params = TeamNewsListQueryParams.parse(request.query);
    return this.teamNewsQueryService.getFilters(params);
  }
}
