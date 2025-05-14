import { Controller, Req, Body, Param, NotFoundException, ForbiddenException, UsePipes, UseGuards, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { Api, initNestServer, ApiDecorator } from '@ts-rest/nest';
import { Request } from 'express';
import { apiEvents } from 'libs/contracts/src/lib/contract-pl-events';
import {
  PLEventLocationQueryParams,
  ResponsePLEventLocationWithRelationsSchema,
  PLEventQueryParams,
  ResponsePLEventSchemaWithRelationsSchema,
  CreatePLEventGuestSchemaDto,
  UpdatePLEventGuestSchemaDto,
  DeletePLEventGuestsSchemaDto,
  PLEventGuestQuerySchema,
  CreatePLEventSchemaDto,
  PLCreateEventSchema,
  CreatePLEventGuestSchema,
  DeletePLEventGuestsSchema
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { PLEventsService } from './pl-events.service';
import { PLEventSyncService } from './pl-event-sync.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { UserAuthValidateGuard } from '../guards/user-auth-validate.guard';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { NoCache } from '../decorators/no-cache.decorator';
import { MembersService } from '../members/members.service';
import { PLEventLocationsService } from './pl-event-locations.service';
import { PLEventGuestsService } from './pl-event-guests.service';
import { isEmpty } from 'lodash';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { InternalAuthGuard } from '../guards/auth.guard';
import { TeamsService } from '../teams/teams.service';
import { ApiBodyFromZod } from '../decorators/api-body-from-zod';
const server = initNestServer(apiEvents);
type RouteShape = typeof server.routeShapes;

@ApiTags('PLEvents')
@Controller()
export class PLEventsController {
  constructor(
    private readonly memberService: MembersService,
    private readonly eventService: PLEventsService,
    private readonly eventLocationService: PLEventLocationsService,
    private readonly eventGuestService: PLEventGuestsService,
    private readonly eventSyncService: PLEventSyncService,
    private readonly teamService: TeamsService
  ) { }

  /**
   * This method creates a new event associated with a specific location.
   * 
   * @param locationUid The unique identifier (UID) of the location where the event will be created.
   * @param body The event creation payload containing the required event details, such as name, type, description, 
   *             startDate, endDate, resources, and locationUid.
   * @returns The newly created event object with details such as name, type, start and end dates, and location.
   */
  @Api(server.route.createPLEventByLocation)
  @UseGuards(AdminAuthGuard)
  @ApiBodyFromZod(PLCreateEventSchema)
  @ApiBearerAuth()
  async createPLEventByLocation(
    @Param('uid') locationUid: string,
    @Body() body: CreatePLEventSchemaDto,
  ) {
    const event = { ...body };
    const requestor = await this.memberService.findMemberByRole();
    return await this.eventService.createPLEvent(event, requestor?.email)
  }

  @Api(server.route.getPLEventGuestsByLocation)
  @UseGuards(UserAuthValidateGuard)
  @NoCache()
  @ApiBearerAuth()
  async findPLEventGuestsByLocation(
    @Req() request: Request,
    @Param('uid') locationUid: string
  ) {
    const member = request['userEmail'] ? await this.memberService.findMemberByEmail(request['userEmail']) : null;
    return await this.eventGuestService.getPLEventGuestsByLocationAndType(locationUid, request.query, member);
  }

  @Api(server.route.getPLEventBySlug)
  @ApiParam({ name: 'slug', type: 'string' })
  @ApiOkResponseFromZod(ResponsePLEventSchemaWithRelationsSchema)
  @UseGuards(UserAuthValidateGuard)
  @NoCache()
  @ApiBearerAuth()
  async findOne(
    @ApiDecorator() { params: { slug } }: RouteShape['getPLEventBySlug'],
    @Req() request: Request
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(PLEventGuestQuerySchema);
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    if (request.query.searchBy) {
      delete builtQuery.where?.searchBy;
      builtQuery.where = {
        AND: [
          builtQuery.where,
          this.eventService.buildSearchFilter(request.query),
        ]
      };
    }
    const event = await this.eventService.getPLEventBySlug(slug, builtQuery, request['isUserLoggedIn']);
    if (!event) {
      throw new NotFoundException(`Event not found with slug: ${slug}.`);
    }
    return event;
  }

  @Api(server.route.createPLEventGuestByLocation)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  @ApiBodyFromZod(CreatePLEventGuestSchema)
  @ApiBearerAuth()
  async createPLEventGuestByLocation(
    @Param("uid") locationUid,
    @Body() body: CreatePLEventGuestSchemaDto,
    @Req() request
  ): Promise<any> {
    const userEmail = request["userEmail"];
    const { type } = request.query;
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    const result = await this.memberService.isMemberPartOfTeams(member, [body.teamUid]) ||
      await this.memberService.checkIfAdminUser(member);
    if (!result && !isEmpty(body.teamUid)) {
      throw new ForbiddenException(`Member with email ${userEmail} is not part of 
        team with uid ${body.teamUid} or isn't admin.`);
    }
    const location = await this.eventLocationService.getPLEventLocationByUid(locationUid);
    if (
      !this.memberService.checkIfAdminUser(member) &&
      !this.eventGuestService.checkIfEventsAreUpcoming(location.upcomingEvents, body.events)
    ) {
      throw new ForbiddenException(`Member with email ${userEmail} isn't admin to access past events or future events`);
    }
    return await this.eventGuestService.createPLEventGuestByLocation(body, member, locationUid, userEmail, location, "CREATE", undefined, type);
  }

  @Api(server.route.modifyPLEventGuestByLocation)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  @ApiBodyFromZod(CreatePLEventGuestSchema)
  @ApiBearerAuth()
  async modifyPLEventGuestByLocation(
    @Param("uid") locationUid,
    @Param("guestUid") guestUid,
    @Body() body: UpdatePLEventGuestSchemaDto,
    @Req() request
  ) {
    const userEmail = request["userEmail"];
    const { type } = request.query;
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    const result = await this.memberService.isMemberPartOfTeams(member, [body.teamUid]) ||
      await this.memberService.checkIfAdminUser(member);
    if (!result && !isEmpty(body.teamUid)) {
      throw new ForbiddenException(`Member with email ${userEmail} is not part of team with uid ${body.teamUid} or isn't admin`);
    }
    const location = await this.eventLocationService.getPLEventLocationByUid(locationUid);
    if (
      !this.memberService.checkIfAdminUser(member) && guestUid != member.uid
    ) {
      throw new ForbiddenException(`Member with email ${userEmail} isn't admin to access past events or future events`);
    }
    return await this.eventGuestService.modifyPLEventGuestByLocation(body, location, member, request["userEmail"], type);
  }

  @Api(server.route.deletePLEventGuestsByLocation)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  @ApiBodyFromZod(DeletePLEventGuestsSchema)
  @ApiBearerAuth()
  async deletePLEventGuestsByLocation(
    @Param("uid") locationUid,
    @Body() body: DeletePLEventGuestsSchemaDto,
    @Req() request
  ) {
    const userEmail = request["userEmail"];
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    const result = await this.memberService.checkIfAdminUser(member);
    if (!result && body.membersAndEvents?.length === 0
      && body.membersAndEvents[0]?.memberUid != member.uid) {
      throw new ForbiddenException(`Member with email ${userEmail} is not admin`);
    }
    return await this.eventGuestService.deletePLEventGuests(body.membersAndEvents);
  }

  @Api(server.route.getPLEventsByLoggedInMember)
  @ApiQueryFromZod(PLEventQueryParams)
  @ApiOkResponseFromZod(ResponsePLEventSchemaWithRelationsSchema.array())
  @UseGuards(UserTokenValidation)
  @NoCache()
  @ApiBearerAuth()
  async getPLEventsByLoggedInMember(
    @Param("uid") locationUid,
    @Req() request
  ) {
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    return await this.eventService.getPLEventsByMemberAndLocation(member, locationUid);
  }

  @Api(server.route.getPLEventLocations)
  @ApiQueryFromZod(PLEventLocationQueryParams)
  @ApiOkResponseFromZod(ResponsePLEventLocationWithRelationsSchema.array())
  @NoCache()
  @ApiBearerAuth()
  findLocations(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponsePLEventLocationWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.eventLocationService.getPLEventLocations(builtQuery);
  }

  @Api(server.route.getPLEventTopicsByLocation)
  @UseGuards(UserAuthValidateGuard)
  @ApiBearerAuth()
  findPLEventTopicsByLocation(
    @Req() request: Request,
    @Param('uid') locationUid: string) {
    const { type } = request.query;
    return this.eventGuestService.getPLEventTopicsByLocationAndType(locationUid, type as string)
  }

  @Api(server.route.getPLEventGuestByUidAndLocation)
  @UseGuards(UserTokenValidation)
  @ApiBearerAuth()
  async getPLEventGuestByUidAndLocation(
    @Req() request,
    @Param('uid') locationUid: string,
    @Param('guestUid') guestUid: string
  ) {
    const { type } = request.query;
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    const memberUid = this.memberService.checkIfAdminUser(member) ? guestUid : member.uid;
    return await this.eventGuestService.getPLEventGuestByUidAndLocation(memberUid, locationUid, true, type);
  }

  @Api(server.route.syncPLEventsByLocation)
  @UseGuards(InternalAuthGuard)
  @ApiBearerAuth()
  async syncPLEventsByLocation(
    @Param('uid') locationUid: string,
    @Body() body
  ) {
    const { clientSecret, conference, selectedEventUids } = body;
    if (!clientSecret) {
      throw new UnauthorizedException('client secret is missing');
    }
    if (!conference) {
      throw new BadRequestException('conference is missing');
    }
    return await this.eventSyncService.syncEvents({ locationUid, clientSecret, conference, selectedEventUids });
  }

  @Api(server.route.getAllPLEventGuests)
  @NoCache()
  async getAllPLEventGuest() {
    return await this.eventGuestService.getAllPLEventGuest();
  }

  @Api(server.route.getPLEventGuestTopics)
  @UseGuards(UserTokenValidation)
  @NoCache()
  @ApiBearerAuth()
  async getPLEventGuestTopics(
    @Param('uid') locationUid: string,
    @Param('guestUid') guestUid: string,
    @Req() request
  ) {
    const userEmail = request["userEmail"];
    const requestor = await this.memberService.findMemberByEmail(userEmail);
    const isAdmin = await this.memberService.checkIfAdminUser(requestor);
    if (isAdmin || requestor.uid == guestUid) {
      return await this.eventGuestService.getGuestTopics(locationUid, guestUid);
    }
    return [];
  }

  @Api(server.route.getEventContributors)
  @NoCache()
  async getAllPLEventContributors() {
    return await this.teamService.getAllPLEventContibutors();
  }

  @Api(server.route.getAllAggregatedData)
  @UseGuards(UserAuthValidateGuard)
  @NoCache()
  @ApiBearerAuth()
  async getAllAggregatedData(
    @Req() request: Request 
  ) {
    const loggedInMember = request['userEmail'] ? await this.memberService.findMemberByEmail(request['userEmail']) : null;
    return await this.eventGuestService.getAllAggregatedData(loggedInMember);
  }

  @Api(server.route.sendEventGuestPresenceRequest)
  @UseGuards(UserTokenValidation)
  @ApiBearerAuth()
  async sendEventGuestPresenceRequest(
    @Param('uid') locationUid: string,
    @Body() body,
    @Req() request
  ) {
    const loggedInMember = request['userEmail'] ? await this.memberService.findMemberByEmail(request['userEmail']) : null;
    if(!loggedInMember) {
      throw new UnauthorizedException('User not logged in');
    }
    return await this.eventGuestService.sendEventGuestPresenceRequest(loggedInMember?.email, body);
  }


}
