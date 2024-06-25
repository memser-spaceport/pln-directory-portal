import { Body, Controller, Param, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import {
  MemberDetailQueryParams,
  MemberQueryParams,
  ResponseMemberWithRelationsSchema,
  ChangeEmailRequestDto,
  SendEmailOtpRequestDto,
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
import { NoCache } from '../decorators/no-cache.decorator';
import { AuthGuard } from '../guards/auth.guard';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { LogService } from '../shared/log.service';

const server = initNestServer(apiMembers);
type RouteShape = typeof server.routeShapes;

@Controller()
@NoCache()
export class MemberController {
  constructor(private readonly membersService: MembersService, private logger: LogService) {}

  @Api(server.route.getMembers)
  @ApiQueryFromZod(MemberQueryParams)
  @ApiOkResponseFromZod(ResponseMemberWithRelationsSchema.array())
  async findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseMemberWithRelationsSchema);
    const queryParams = request.query;
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(queryParams);
    const { name__icontains } = queryParams;
    if (name__icontains) {
      delete builtQuery.where?.name;
    }
    builtQuery.where = {
      AND: [
        builtQuery.where,
        this.membersService.buildNameFilters(queryParams),
        this.membersService.buildRoleFilters(queryParams),
      ],
    };
    return await this.membersService.findAll(builtQuery);
  }

  @Api(server.route.getMemberRoles)
  async getMemberFilters(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseMemberWithRelationsSchema);
    const queryParams = request.query;
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(queryParams);
    const { name__icontains } = queryParams;
    if (name__icontains) {
      delete builtQuery.where?.name;
    }
    builtQuery.where = {
      AND: [builtQuery.where, this.membersService.buildNameFilters(queryParams)],
    };
    return await this.membersService.getRolesWithCount(builtQuery, queryParams);
  }

  @Api(server.route.getMember)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  @ApiOkResponseFromZod(ResponseMemberWithRelationsSchema)
  @ApiQueryFromZod(MemberDetailQueryParams)
  @NoCache()
  async findOne(@Req() request: Request, @ApiDecorator() { params: { uid } }: RouteShape['getMember']) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseMemberWithRelationsSchema);
    const builder = new PrismaQueryBuilder(queryableFields, ENABLED_RETRIEVAL_PROFILE);
    const builtQuery = builder.build(request.query);
    const member = await this.membersService.findOne(uid, builtQuery);
    return member;
  }

  @Api(server.route.modifyMember)
  @UseGuards(UserTokenValidation)
  async updateOne(@Param('id') id, @Body() body, @Req() req) {
    this.logger.info(`Member update request - Initated by -> ${req.userEmail}`);
    const participantsRequest = body;
    return await this.membersService.editMemberParticipantsRequest(participantsRequest, req.userEmail);
  }

  @Api(server.route.modifyMemberPreference)
  @UseGuards(AuthGuard)
  async updatePrefernce(@Param('uid') id, @Body() body, @Req() req) {
    const preference = body;
    return await this.membersService.updatePreference(id, preference);
  }

  @Api(server.route.getMemberPreferences)
  @UseGuards(AuthGuard)
  @NoCache()
  async getPreferences(@Param('uid') uid) {
    return await this.membersService.getPreferences(uid);
  }

  @Api(server.route.sendOtpForEmailChange)
  @UseGuards(UserAccessTokenValidateGuard)
  async sendOtpForEmailChange(@Body() sendOtpRequest: SendEmailOtpRequestDto, @Req() req) {
    return await this.membersService.sendOtpForEmailChange(sendOtpRequest.newEmail, req.userEmail);
  }

  @Api(server.route.updateMemberEmail)
  @UseGuards(UserAccessTokenValidateGuard)
  async updateMemberEmail(@Body() changeEmailRequest: ChangeEmailRequestDto, @Req() req) {
    return await this.membersService.updateMemberEmail(changeEmailRequest.newEmail, req.userEmail);
  }

  @Api(server.route.getMemberGitHubProjects)
  async getGitProjects(@Param('uid') uid) {
    return await this.membersService.getGitProjects(uid);
  }
}
