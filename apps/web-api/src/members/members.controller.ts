import { Controller, Req, UseGuards } from '@nestjs/common';
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
import { maskEmail } from '../utils/mask-email';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { MembersService } from './members.service';
import { UserAuthValidateGuard } from '../guards/user-auth-validate.guard';
import { NoCache } from '../decorators/no-cache.decorator';

const server = initNestServer(apiMembers);
type RouteShape = typeof server.routeShapes;

@Controller()
export class MemberController {
  constructor(private readonly membersService: MembersService) {}

  @Api(server.route.getMembers)
  @ApiQueryFromZod(MemberQueryParams)
  @ApiOkResponseFromZod(ResponseMemberWithRelationsSchema.array())
  @UseGuards(UserAuthValidateGuard)
  @NoCache()
  async findAll(@Req() request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseMemberWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    const members = await this.membersService.findAll(
      builtQuery,
      !request?.isUserLoggedIn
    );
    return members;
  }

  @Api(server.route.getMember)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  @ApiOkResponseFromZod(ResponseMemberWithRelationsSchema)
  @ApiQueryFromZod(MemberDetailQueryParams)
  @UseGuards(UserAuthValidateGuard)
  @NoCache()
  findOne(
    @Req() request,
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
    return this.membersService.findOne(
      uid,
      builtQuery,
      !request?.isUserLoggedIn
    );
  }
}
