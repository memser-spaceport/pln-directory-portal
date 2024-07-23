import { Controller, Req, Body, Param, NotFoundException, ForbiddenException, UsePipes, UseGuards } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Api, initNestServer, ApiDecorator } from '@ts-rest/nest';
import { Request } from 'express';
import { apiEvents } from 'libs/contracts/src/lib/contract-pl-events';
import {
  PLEventQueryParams,
  ResponsePLEventSchemaWithRelationsSchema,
  ResponsePLEventSchema,
  CreatePLEventGuestSchemaDto,
  UpdatePLEventGuestSchemaDto
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
import {MembersService} from '../members/members.service';

const server = initNestServer(apiEvents);
type RouteShape = typeof server.routeShapes;

@Controller()
export class PLEventsController {
  constructor(private readonly eventService: PLEventsService, private memberService: MembersService) {}

  @Api(server.route.getPLEvents)
  @ApiQueryFromZod(PLEventQueryParams)
  @ApiOkResponseFromZod(ResponsePLEventSchemaWithRelationsSchema.array())
  findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponsePLEventSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.eventService.getPLEvents(builtQuery);
  }

  @Api(server.route.getPLEvent)
  @ApiParam({ name: 'slug', type: 'string' })
  @ApiOkResponseFromZod(ResponsePLEventSchemaWithRelationsSchema)
  @UseGuards(UserAuthValidateGuard)
  @NoCache()
  async findOne(
    @ApiDecorator() { params: { slug } }: RouteShape['getPLEvent'],
    @Req() request: Request
  ) {
    const event = await this.eventService.getPLEventBySlug(slug, request["isUserLoggedIn"]);
    if (!event) {
      throw new NotFoundException(`Event not found with slug: ${slug}.`);
    }
    return event;
  }

  @Api(server.route.createPLEventGuest)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async createPLEventGuest(
    @Param('slug') slug: string,
    @Body() body: CreatePLEventGuestSchemaDto,
    @Req() request
  ): Promise<any> {
    const userEmail = request["userEmail"];
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    const result = await this.memberService.isMemberPartOfTeams(member, [body.teamUid]) ||
      await this.memberService.checkIfAdminUser(member);
    if (!result) {
      throw new ForbiddenException(`Member with email ${userEmail} is not part of team with uid ${body.teamUid} or isn't admin`);
    }
    return await this.eventService.createPLEventGuest(body as any, slug, member);
  }

  @Api(server.route.modifyPLEventGuest)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async modifyPLEventGuest(
    @Param('slug') slug: string,
    @Param('uid') uid: string,
    @Body() body: UpdatePLEventGuestSchemaDto,
    @Req() request
  ) {
    const userEmail = request["userEmail"];
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    const result = await this.memberService.isMemberPartOfTeams(member, [body.teamUid]) ||
      await this.memberService.checkIfAdminUser(member);
    if (!result) {
      throw new ForbiddenException(`Member with email ${userEmail} is not part of team with uid ${body.teamUid} or isn't admin`);
    }
    return await this.eventService.modifyPLEventGuestByUid(uid, body as any, slug, member);
  }

  @Api(server.route.deletePLEventGuests)
  @UsePipes(ZodValidationPipe)
  @UseGuards(UserTokenValidation)
  async deletePLEventGuests(
    @Body() body,
    @Req() request
  ) {
    const userEmail = request["userEmail"];
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    const result = await this.memberService.checkIfAdminUser(member);
    if (!result) {
      throw new ForbiddenException(`Member with email ${userEmail} is not admin `);
    }
    return await this.eventService.deletePLEventGuests(body.guests);
  }

  @Api(server.route.getPLEventsByLoggedInMember)
  @ApiQueryFromZod(PLEventQueryParams)
  @ApiOkResponseFromZod(ResponsePLEventSchemaWithRelationsSchema.array())
  @UseGuards(UserTokenValidation)
  @NoCache()
  async getPLEventsByLoggedInMember(
    @Req() request
  ) {
    const member: any = await this.memberService.findMemberByEmail(request["userEmail"]);
    return await this.eventService.getPLEventsByMember(member);
  }

}
