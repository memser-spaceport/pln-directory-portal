import {
  Body,
  Controller,
  Param,
  Req,
  UseGuards,
  UsePipes,
  UseInterceptors,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { ZodValidationPipe } from 'nestjs-zod';
import { z } from 'zod';
import {
  MemberDetailQueryParams,
  MemberQueryParams,
  ResponseMemberWithRelationsSchema,
  ChangeEmailRequestDto,
  SendEmailOtpRequestDto,
  MemberFilterQueryParams,
  AutocompleteQueryParams,
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
import { ParticipantsReqValidationPipe } from '../pipes/participant-request-validation.pipe';
import { IsVerifiedMemberInterceptor } from '../interceptors/verified-member.interceptor';
import { isEmpty } from 'lodash';

const server = initNestServer(apiMembers);
type RouteShape = typeof server.routeShapes;

@Controller()
@NoCache()
export class MemberController {
  constructor(private readonly membersService: MembersService, private logger: LogService) {}

  /**
   * Retrieves a list of members based on query parameters.
   * Builds a Prisma query from the queryable fields and adds filters for names, roles, and recent members.
   *
   * @param request - HTTP request object containing query parameters
   * @returns Array of members with related data
   */
  @Api(server.route.getMembers)
  @ApiQueryFromZod(MemberQueryParams)
  @ApiOkResponseFromZod(ResponseMemberWithRelationsSchema.array())
  @UseInterceptors(IsVerifiedMemberInterceptor)
  @NoCache()
  async findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseMemberWithRelationsSchema);
    const queryParams = request.query;
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(queryParams);
    const { name__icontains, isHost, isSpeaker, isSponsor } = queryParams;
    if (name__icontains) {
      delete builtQuery.where?.name;
    }
    if (isHost || isSpeaker || isSponsor) {
      //Remove isHost and isSpeaker from the default query since it is to be added in eventGuest.
      delete builtQuery.where?.isHost;
      delete builtQuery.where?.isSpeaker;
      delete builtQuery.where?.isSponsor;
    }
    builtQuery.where = {
      AND: [
        builtQuery.where,
        this.membersService.buildNameFilters(queryParams),
        this.membersService.buildRoleFilters(queryParams),
        this.membersService.buildRecentMembersFilter(queryParams),
        this.membersService.buildParticipationTypeFilter(queryParams),
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
    return await this.membersService.findAll(builtQuery);
  }

  /**
   * Retrieves a list of members by their UIDs.
   * Returns simplified member data with only UID, name, and email.
   *
   * @param body - Request body containing an array of member UIDs
   * @returns Array of simplified member data
   */
  @Api(server.route.getMembersByIds)
  @UseInterceptors(IsVerifiedMemberInterceptor)
  @NoCache()
  async findMembersByIds(@ApiDecorator() { body }: RouteShape['getMembersByIds']) {
    return await this.membersService.findMembersByIds(body.memberIds);
  }

  /**
   * Retrieves member roles based on query parameters with their counts.
   * Builds a Prisma query and applies filters to return roles with the count of associated members.
   *
   * @param request - HTTP request object containing query parameters
   * @returns Array of roles with member counts
   */
  @Api(server.route.getMemberRoles)
  @UseInterceptors(IsVerifiedMemberInterceptor)
  @NoCache()
  async getMemberRoleFilters(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseMemberWithRelationsSchema);
    const queryParams = request.query;
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(queryParams);
    const { name__icontains, isHost, isSpeaker, isSponsor } = queryParams;
    if (name__icontains) {
      delete builtQuery.where?.name;
    }
    if (isHost || isSpeaker || isSponsor) {
      //Remove isHost and isSpeaker from the default query since it is to be added in eventGuest.
      delete builtQuery.where?.isHost;
      delete builtQuery.where?.isSpeaker;
      delete builtQuery.where?.isSponsor;
    }
    builtQuery.where = {
      AND: [
        builtQuery.where,
        this.membersService.buildNameFilters(queryParams),
        this.membersService.buildRecentMembersFilter(queryParams),
        ,
        this.membersService.buildParticipationTypeFilter(queryParams),
      ],
    };
    return await this.membersService.getRolesWithCount(builtQuery, queryParams);
  }

  /**
   * Retrieves member filters.
   *
   * @param request - HTTP request object containing query parameters
   * @returns return list of member filters.
   */
  @Api(server.route.getMemberFilters)
  @UseInterceptors(IsVerifiedMemberInterceptor)
  @NoCache()
  async getMembersFilter(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseMemberWithRelationsSchema);
    const queryParams = request.query;
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(queryParams);
    const { name__icontains, isHost, isSpeaker, isSponsor } = queryParams;
    if (name__icontains) {
      delete builtQuery.where?.name;
    }
    if (isHost || isSpeaker || isSponsor) {
      //Remove isHost and isSpeaker from the default query since it is to be added in eventGuest.
      delete builtQuery.where?.isHost;
      delete builtQuery.where?.isSpeaker;
      delete builtQuery.where?.isSponsor;
    }
    builtQuery.where = {
      AND: [
        builtQuery.where,
        this.membersService.buildNameFilters(queryParams),
        this.membersService.buildRoleFilters(queryParams),
        this.membersService.buildRecentMembersFilter(queryParams),
        ,
        this.membersService.buildParticipationTypeFilter(queryParams),
      ],
    };
    return await this.membersService.getMemberFilters(builtQuery);
  }

  /**
   * Retrieves details of a specific member by UID.
   * Builds a query for member details including relations and profile data.
   *
   * @param request - HTTP request object containing query parameters
   * @param uid - UID of the member to fetch
   * @returns Member details with related data
   */
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

    if (!member) {
      this.logger.error(`Member not found: uid=${uid}`);
      throw new NotFoundException('Member not found');
    }

    return member;
  }

  /**
   * Updates member details based on the provided participant request data.
   * Uses a validation pipe to ensure that the request is valid before processing.
   *
   * @param id - ID of the member to update
   * @param body - Request body containing member data to update
   * @param req - HTTP request object containing user email
   * @returns Updated member data
   */
  @Api(server.route.modifyMember)
  @UseGuards(UserTokenValidation)
  @UsePipes(new ParticipantsReqValidationPipe())
  async updateMember(@Param('uid') uid, @Body() participantsRequest, @Req() req) {
    this.logger.info(`Member update request - Initated by -> ${req.userEmail}`);
    const requestor = await this.membersService.findMemberByEmail(req.userEmail);
    const { referenceUid } = participantsRequest;
    if (!requestor.isDirectoryAdmin && referenceUid !== requestor.uid) {
      throw new ForbiddenException(`Member isn't authorized to update the member`);
    }
    if (!isEmpty(participantsRequest.newData.isVerified) && !this.membersService.checkIfAdminUser(requestor)) {
      throw new ForbiddenException(`Member isn't authorized to verify a member`);
    }
    return await this.membersService.updateMemberFromParticipantsRequest(
      uid,
      participantsRequest,
      requestor.email,
      requestor.isDirectoryAdmin
    );
  }

  /**
   * Updates a member's preference settings.
   *
   * @param id - UID of the member whose preferences will be updated
   * @param body - Request body containing preference data
   * @param req - HTTP request object
   * @returns Updated preference data
   */
  @Api(server.route.modifyMemberPreference)
  @UseGuards(AuthGuard)
  async updatePrefernce(@Param('uid') id, @Body() body) {
    const preference = body;
    return await this.membersService.updatePreference(id, preference);
  }

  @Api(server.route.updateMember)
  @UseGuards(UserTokenValidation)
  async updateMemberByUid(@Param('uid') uid, @Body() body, @Req() req) {
    this.logger.info(`Member update request - Initated by -> ${req.userEmail}`);
    const requestor = await this.membersService.findMemberByEmail(req.userEmail);
    if (!requestor.isDirectoryAdmin && uid !== requestor.uid) {
      throw new ForbiddenException(`Member isn't authorized to update the member`);
    }
    if (!isEmpty(body.isVerified) && !this.membersService.checkIfAdminUser(requestor)) {
      throw new ForbiddenException(`Member isn't authorized to verify a member`);
    }
    return await this.membersService.updateMemberByUid(uid, body);
  }

  /**
   * Retrieves a member's preference settings by UID.
   *
   * @param uid - UID of the member whose preferences will be fetched
   * @returns Member's preferences
   */
  @Api(server.route.getMemberPreferences)
  @UseGuards(AuthGuard)
  @NoCache()
  async getPreferences(@Param('uid') uid) {
    return await this.membersService.getPreferences(uid);
  }

  /**
   * Sends an OTP for email change to the new email provided by the member.
   *
   * @param sendOtpRequest - Request DTO containing the new email
   * @param req - HTTP request object containing user email
   * @returns Response indicating success of OTP sending
   */
  @Api(server.route.sendOtpForEmailChange)
  @UseGuards(UserAccessTokenValidateGuard)
  @UsePipes(ZodValidationPipe)
  async sendOtpForEmailChange(@Body() sendOtpRequest: SendEmailOtpRequestDto, @Req() req) {
    const oldEmailId = req.userEmail;
    if (sendOtpRequest.newEmail.toLowerCase().trim() === oldEmailId.toLowerCase().trim()) {
      throw new BadRequestException('New email cannot be same as old email');
    }
    let isMemberAvailable = await this.membersService.isMemberExistForEmailId(oldEmailId);
    if (!isMemberAvailable) {
      throw new ForbiddenException('Your email seems to have been updated recently. Please login and try again');
    }
    isMemberAvailable = await this.membersService.isMemberExistForEmailId(sendOtpRequest.newEmail);
    if (isMemberAvailable) {
      throw new BadRequestException('Above email id is already used. Please try again with different email id.');
    }
    return await this.membersService.sendOtpForEmailChange(sendOtpRequest.newEmail);
  }

  /**
   * Updates a member's email address to a new one.
   *
   * @param changeEmailRequest - Request DTO containing the new email address
   * @param req - HTTP request object containing user email
   * @returns Updated member data with new email
   */
  @Api(server.route.updateMemberEmail)
  @UseGuards(UserAccessTokenValidateGuard)
  @UsePipes(ZodValidationPipe)
  async updateMemberEmail(@Body() changeEmailRequest: ChangeEmailRequestDto, @Req() req) {
    const memberInfo = await this.membersService.findMemberByEmail(req.userEmail);
    if (!memberInfo || !memberInfo.externalId) {
      throw new ForbiddenException('Please login again and try');
    }
    return await this.membersService.updateMemberEmail(changeEmailRequest.newEmail, req.userEmail, memberInfo);
  }

  /**
   * Retrieves GitHub projects associated with the member identified by UID.
   *
   * @param uid - UID of the member whose GitHub projects will be fetched
   * @returns Array of GitHub projects associated with the member
   */
  @Api(server.route.getMemberGitHubProjects)
  async getGitProjects(@Param('uid') uid) {
    return await this.membersService.getGitProjects(uid);
  }

  /**
   * Advanced member search with filtering by office hours, topics, and roles.
   *
   * @param request - HTTP request object containing query parameters
   * @returns Paginated search results with members and metadata
   */
  @Api(server.route.searchMembers)
  @ApiQueryFromZod(MemberFilterQueryParams.optional())
  @UseInterceptors(IsVerifiedMemberInterceptor)
  @NoCache()
  async searchMembers(@Req() request: Request) {
    const params = request.query as unknown as z.infer<typeof MemberFilterQueryParams>;
    return await this.membersService.searchMembers(params || {});
  }

  /**
   * Autocomplete topics from skills, experiences, office hours interests and help.
   *
   * @param request - HTTP request object containing query parameters
   * @returns Paginated autocomplete results with counts
   */
  @Api(server.route.autocompleteTopics)
  @ApiQueryFromZod(AutocompleteQueryParams.optional())
  @UseInterceptors(IsVerifiedMemberInterceptor)
  @NoCache()
  async autocompleteTopics(@Req() request: Request) {
    const params = request.query as unknown as z.infer<typeof AutocompleteQueryParams>;
    const { q, page, limit } = params || {};
    if (!q) {
      throw new BadRequestException('Query parameter "q" is required');
    }
    return await this.membersService.autocompleteTopics(q, page, limit);
  }

  /**
   * Autocomplete roles from team member roles.
   *
   * @param request - HTTP request object containing query parameters
   * @returns Paginated autocomplete results with counts
   */
  @Api(server.route.autocompleteRoles)
  @ApiQueryFromZod(AutocompleteQueryParams.optional())
  @UseInterceptors(IsVerifiedMemberInterceptor)
  @NoCache()
  async autocompleteRoles(@Req() request: Request) {
    const params = request.query as unknown as z.infer<typeof AutocompleteQueryParams>;
    const { q, page, limit } = params || {};
    if (!q) {
      throw new BadRequestException('Query parameter "q" is required');
    }
    return await this.membersService.autocompleteRoles(q, page, limit);
  }

  /**
   * Retrieves member details by externalId.
   *
   * @param externalId - External ID of the member to fetch
   * @returns Member details with related data
   */
  @Api(server.route.getMemberByExternalId)
  @UseInterceptors(IsVerifiedMemberInterceptor)
  @NoCache()
  async getMemberByExternalId(@Param('externalId') externalId: string) {
    const member = await this.membersService.findByExternalId(externalId);

    if (!member) {
      this.logger.error(`Member not found: externalId=${externalId}`);
      throw new NotFoundException('Member not found');
    }

    return member;
  }
}
