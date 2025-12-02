/* eslint-disable prettier/prettier */
import {
  Body,
  CacheTTL,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer, TsRest } from '@ts-rest/nest';
import { Request } from 'express';
import { z } from 'zod';
import { apiTeam } from 'libs/contracts/src/lib/contract-team';
import {
  ResponseTeamWithRelationsSchema,
  TeamDetailQueryParams,
  TeamFilterQueryParams,
  TeamQueryParams,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NOT_FOUND_GLOBAL_RESPONSE_SCHEMA } from '../utils/constants';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { TeamsService } from './teams.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { ParticipantsReqValidationPipe } from '../pipes/participant-request-validation.pipe';
import { AccessLevelsGuard } from '../guards/access-levels.guard';
import { AccessLevels } from '../decorators/access-levels.decorator';
import { AccessLevel } from '../../../../libs/contracts/src/schema/admin-member';
import { MembersService } from '../members/members.service';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { QueryCache } from '../decorators/query-cache.decorator';
import { UpdateTeamAccessLevelDto } from './dto/teams.dto';
import { ParticipantsRequest } from './dto/members.dto';

const server = initNestServer(apiTeam);
type RouteShape = typeof server.routeShapes;
@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService, private readonly membersService: MembersService) {}

  @Api(server.route.teamFilters)
  @ApiQueryFromZod(TeamQueryParams)
  @QueryCache()
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  async getTeamFilters(@Req() request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseTeamWithRelationsSchema);
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    const { focusAreas, isHost }: any = request.query;
    if (isHost) {
      //Remove isHost from the default query since it is to be added in eventGuest.
      delete builtQuery.where?.isHost;
    }
    builtQuery.where = {
      AND: [
        builtQuery.where ? builtQuery.where : {},
        this.teamsService.buildFocusAreaFilters(focusAreas),
        this.teamsService.buildRecentTeamsFilter(request.query),
        this.teamsService.buildParticipationTypeFilter(request.query),
        this.teamsService.buildAskTagFilter(request.query),
      ],
    };
    return await this.teamsService.getTeamFilters(builtQuery, request?.userEmail || null);
  }

  @Api(server.route.getTeams)
  @ApiQueryFromZod(TeamQueryParams)
  @ApiOkResponseFromZod(ResponseTeamWithRelationsSchema.array())
  @NoCache()
  findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseTeamWithRelationsSchema);
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    const { focusAreas, isHost, isSponsor }: any = request.query;
    if (isHost || isSponsor) {
      //Remove isHost from the default query since it is to be added in eventGuest.
      delete builtQuery.where?.isHost;
      delete builtQuery.where?.isSponsor;
    }
    builtQuery.where = {
      AND: [
        builtQuery.where ? builtQuery.where : {},
        this.teamsService.buildFocusAreaFilters(focusAreas),
        this.teamsService.buildRecentTeamsFilter(request.query),
        this.teamsService.buildParticipationTypeFilter(request.query),
        this.teamsService.buildAskTagFilter(request.query),
        this.teamsService.buildTierFilter(request.query['tiers'] as string),
      ],
    };
    // Check for the office hours blank when OH not null is passed
    if (request.query['officeHours__not'] === 'null') {
      builtQuery.where.AND.push({
        officeHours: {
          not: '',
        },
      });
    }

    //when "default" is passed as a parameter to orderBy, teams with asks will appear at the beginning of the list.
    const orderByQuery: any = request.query.orderBy;
    if (orderByQuery && orderByQuery.includes('default')) {
      let order: any = [
        {
          asks: {
            _count: 'desc',
          },
        },
      ];
      const queryOrderBy: any = builtQuery.orderBy;
      if (builtQuery.orderBy) {
        order = [...order, ...queryOrderBy];
      }
      builtQuery.orderBy = order;
    }

    if (builtQuery.select) {
      builtQuery.select.investorProfile = true;
      builtQuery.select.logo = { select: { url: true } };
    } else if (builtQuery.include) {
      builtQuery.include.investorProfile = true;
      builtQuery.include.logo = { select: { url: true } };
    } else {
      builtQuery.include = { investorProfile: true, logo: { select: { url: true } } };
    }

    return this.teamsService.findAll(builtQuery);
  }

  @Api(server.route.getTeam)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiOkResponseFromZod(ResponseTeamWithRelationsSchema)
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  @ApiQueryFromZod(TeamDetailQueryParams)
  @NoCache()
  @UseGuards(UserTokenCheckGuard)
  findOne(@Req() request, @ApiDecorator() { params: { uid } }: RouteShape['getTeam']) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseTeamWithRelationsSchema);
    const builder = new PrismaQueryBuilder(queryableFields, ENABLED_RETRIEVAL_PROFILE);
    const builtQuery = builder.build(request.query);
    return this.teamsService.findTeamByUid(uid, request.userEmail, builtQuery);
  }

  @Api(server.route.modifyTeam)
  @UseGuards(UserTokenValidation, AccessLevelsGuard)
  @AccessLevels(AccessLevel.L2, AccessLevel.L3, AccessLevel.L4, AccessLevel.L5, AccessLevel.L6)
  @UsePipes(new ParticipantsReqValidationPipe())
  async updateOne(@Param('uid') teamUid, @Body() body, @Req() req) {
    await this.teamsService.validateRequestor(req.userEmail, teamUid);
    return await this.teamsService.updateTeamFromParticipantsRequest(teamUid, body, req.userEmail);
  }

  // TODO: Remove this endpoint after frontend integration with new ask api
  @Api(server.route.patchTeam)
  @UseGuards(UserTokenValidation, AccessLevelsGuard)
  @AccessLevels(AccessLevel.L2, AccessLevel.L3, AccessLevel.L4, AccessLevel.L5, AccessLevel.L6)
  async addAsk(@Param('uid') teamUid, @Body() body, @Req() req) {
    await this.teamsService.isTeamMemberOrAdmin(req.userEmail, teamUid);
    const res = await this.teamsService.addEditTeamAsk(teamUid, body.teamName, req.userEmail, body.ask);
    return res;
  }

  /* Allows a team member to self-update their role within a team.
    - Any authenticated user: can upsert their TeamMemberRole (role, investmentTeam).
    - Team lead only: can also update team.isFund and team investor profile.*/
  @Patch('v1/teams/:uid/profile-update')
  @UseGuards(UserTokenValidation)
  @NoCache()
  async memberSelfUpdate(@Param('uid') teamUid: string, @Body() body: any, @Req() req: Request) {
    return this.teamsService.updateTeamMemberRoleAndInvestorProfile(teamUid, body, req['userEmail']);
  }

  /**
   * Soft deletes a team by marking it as L0 (inactive).
   * Only users with a DIRECTORYADMIN role can delete teams.
   * L0 teams are not visible in queries.
   */
  @TsRest(server.route.deleteTeam)
  @UseGuards(UserTokenValidation)
  @NoCache()
  async deleteTeam(@Param('uid') teamUid: string, @Req() req: Request) {
    const userEmail = req['userEmail'];
    const requestor = await this.membersService.findMemberByEmail(userEmail);

    if (!requestor) {
      throw new ForbiddenException(`Member with email ${userEmail} not found`);
    }

    const isDirectoryAdmin = this.membersService.checkIfAdminUser(requestor);

    if (!isDirectoryAdmin) {
      throw new ForbiddenException(`Member with email ${userEmail} isn't admin to delete the team`);
    }

    return this.teamsService.softDeleteTeam(teamUid);
  }

  /**
   * Advanced team search with filtering by isFund, typicalCheckSize range, and investmentFocus.
   *
   * @param request - HTTP request object containing query parameters
   * @returns Paginated search results with teams and metadata
   */
  @TsRest(server.route.searchTeams)
  @ApiQueryFromZod(TeamFilterQueryParams.optional())
  @QueryCache()
  @CacheTTL(60)
  async searchTeams(@Req() request: Request) {
    const params = request.query as unknown as z.infer<typeof TeamFilterQueryParams>;
    return await this.teamsService.searchTeams(params || {});
  }

  /**
   * Admin: update access level of a team.
   *
   * PATCH /teams/:uid/access-level
   * body: { accessLevel: "L0" | "L1" | ... }
   */
  @Patch('v1/teams/:uid/access-level')
  @NoCache()
  async updateTeamAccessLevel(@Param('uid') uid: string, @Body() body: UpdateTeamAccessLevelDto) {
    return await this.teamsService.updateAccessLevel(uid, body.accessLevel);
  }

  /**
   * Admin: full team update using old ParticipantsRequest payload.
   */
  @Patch('v1/admin/teams/:uid/full')
  @UseGuards(UserTokenValidation, AccessLevelsGuard)
  @AccessLevels(AccessLevel.L4, AccessLevel.L5, AccessLevel.L6)
  @NoCache()
  async adminUpdateTeamFull(@Param('uid') teamUid: string, @Body() body: ParticipantsRequest, @Req() req: Request) {
    return this.teamsService.updateTeamFromParticipantsRequest(teamUid, body, req['userEmail']);
  }

  /**
   * Back-office: list teams.
   * GET /teams?includeL0=true|false
   */
  @Get('v1/admin/teams')
  @NoCache()
  async getTeams() {
    const teams = await this.teamsService.findAllForAdmin();
    return { teams };
  }
}
