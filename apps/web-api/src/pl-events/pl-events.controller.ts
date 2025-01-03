import { Controller, Req, Body, Param, NotFoundException, ForbiddenException, UsePipes, UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Api, initNestServer, ApiDecorator } from '@ts-rest/nest';
import { Request, query } from 'express';
import { apiEvents } from 'libs/contracts/src/lib/contract-pl-events';
import {
  PLEventLocationQueryParams,
  ResponsePLEventLocationWithRelationsSchema,
  PLEventQueryParams,
  ResponsePLEventSchemaWithRelationsSchema,
  CreatePLEventGuestSchemaDto,
  UpdatePLEventGuestSchemaDto,
  DeletePLEventGuestsSchemaDto,
  PLEventGuestSchema,
  PLEventGuestQuerySchema
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { PLEventsService } from './pl-events.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { UserAuthValidateGuard } from '../guards/user-auth-validate.guard';
import { ZodValidationPipe } from 'nestjs-zod';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { NoCache } from '../decorators/no-cache.decorator';
import { MembersService } from '../members/members.service';
import { PLEventLocationsService } from './pl-event-locations.service';
import { PLEventGuestsService } from './pl-event-guests.service';
import { isEmpty } from 'lodash';

const server = initNestServer(apiEvents);
type RouteShape = typeof server.routeShapes;

@Controller()
export class PLEventsController {
  constructor(
    private readonly memberService: MembersService,
    private readonly eventService: PLEventsService,
    private readonly eventLocationService: PLEventLocationsService,
    private readonly eventGuestService: PLEventGuestsService
  ) { }

  @Api(server.route.getPLEventGuestsByLocation)
  @UseGuards(UserAuthValidateGuard)
  @NoCache()
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
  async createPLEventGuestByLocation(
    @Param("uid") locationUid,
    @Body() body: CreatePLEventGuestSchemaDto,
    @Req() request
  ): Promise<any> {
    const userEmail = request["userEmail"];
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    const result = await this.memberService.isMemberPartOfTeams(member, [body.teamUid]) ||
      await this.memberService.checkIfAdminUser(member);
    if (!result && !isEmpty(body.teamUid) ) {
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
    return await this.eventGuestService.createPLEventGuestByLocation(body, member);
  }

  @Api(server.route.modifyPLEventGuestByLocation)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async modifyPLEventGuestByLocation(
    @Param("uid") locationUid,
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
      !this.memberService.checkIfAdminUser(member) &&
      !this.eventGuestService.checkIfEventsAreUpcoming(location.upcomingEvents, body.events)
    ) {
      throw new ForbiddenException(`Member with email ${userEmail} isn't admin to access past events or future events`);
    }
    return await this.eventGuestService.modifyPLEventGuestByLocation(body, location, member, type);
  }

  @Api(server.route.deletePLEventGuestsByLocation)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
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
  findPLEventTopicsByLocation(
    @Req() request: Request,
    @Param('uid') locationUid: string) {
    const { type } = request.query;
    return this.eventGuestService.getPLEventTopicsByLocationAndType(locationUid, type as string)
  }

  @Api(server.route.getPLEventGuestByUidAndLocation)
  @UseGuards(UserTokenValidation)
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
}
