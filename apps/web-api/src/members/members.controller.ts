import { Body, Controller, Param, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import {
  MemberDetailQueryParams,
  MemberQueryParams,
  ResponseMemberWithRelationsSchema,
} from 'libs/contracts/src/schema';
import { apiMembers } from '../../../../libs/contracts/src/lib/contract-member';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NOT_FOUND_GLOBAL_RESPONSE_SCHEMA } from '../utils/constants';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { MembersService } from './members.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { LogService } from '../shared/log.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { AuthGuard } from '../guards/auth.guard';

const server = initNestServer(apiMembers);
type RouteShape = typeof server.routeShapes;

@Controller()
@NoCache()
export class MemberController {
  constructor(
    private readonly membersService: MembersService,
    private readonly logger: LogService
  ) {}

  @Api(server.route.getMembers)
  @ApiQueryFromZod(MemberQueryParams)
  @ApiOkResponseFromZod(ResponseMemberWithRelationsSchema.array())
  async findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseMemberWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.membersService.findAll(builtQuery);
  }

  @Api(server.route.getMember)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  @ApiOkResponseFromZod(ResponseMemberWithRelationsSchema)
  @ApiQueryFromZod(MemberDetailQueryParams)
  async findOne(
    @Req() request: Request,
    @ApiDecorator() { params: { uid } }: RouteShape['getMember']
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseMemberWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(
      queryableFields,
      ENABLED_RETRIEVAL_PROFILE
    );
    const builtQuery = builder.build(request.query);
    const member = await this.membersService.findOne(uid, builtQuery);
    let repositories = [];
    if (member?.githubHandler) {
      repositories = await this.membersService.getRepositories(
        member?.githubHandler
      );
    }
    const memberResponse = { ...member, repositories };
    return memberResponse;
  }

  @Api(server.route.modifyMember)
  @UseGuards(UserTokenValidation)
  async updateOne(@Param('id') id, @Body() body, @Req() req) {
    const participantsRequest = body;
    return await this.membersService.editMemberParticipantsRequest(
      participantsRequest,
      req.userEmail
    );
  }

  @Api(server.route.modifyMemberPreference)
  @UseGuards(AuthGuard)
  async updatePrefernce( @Param('uid') id,@Body() body, @Req() req) {
    const preference = body;
    return await this.membersService.updatePreference(
      id,
      preference
    );
  }

  @Api(server.route.getMemberPreferences)
  @UseGuards(AuthGuard)
  @NoCache()
  async getPreferences(@Param('uid') uid){
    return await this.membersService.getPreferences(uid);
  }
}
