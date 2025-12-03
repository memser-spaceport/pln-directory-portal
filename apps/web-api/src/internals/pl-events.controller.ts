import { Controller, UseGuards, Req, Param, Body, UsePipes } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Request } from 'express';
import { Api, initNestServer, ApiDecorator } from '@ts-rest/nest';
import { apiInternals } from 'libs/contracts/src/lib/contract-internals';
import { 
  ResponsePLEventGuestSchemaWithRelationsSchema, 
  ResponsePLEventSchemaWithRelationsSchema,
  createLocationAssociationSchemaDto,
  UpdatePLEventLocationAssociationSchemaDto,
  ResponsePLEventLocationAssociationWithRelationsSchema,
  CreatePLEventLocationSchemaDto,
  UpdatePLEventLocationSchemaDto,
  ResponsePLEventLocationSchema
} from 'libs/contracts/src/schema';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { PLEventGuestsService } from '../pl-events/pl-event-guests.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { PLEventLocationsService } from '../pl-events/pl-event-locations.service';
import { PLEventLocationAssociationService } from '../pl-events/pl-event-location-association.service';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { InternalAuthGuard } from '../guards/auth.guard';
import { EventsService } from '../events/events.service';
import { ZodValidationPipe } from 'nestjs-zod';

const server = initNestServer(apiInternals);
type RouteShape = typeof server.routeShapes;

@Controller("")
@UseGuards(InternalAuthGuard)
export class PLEventsInternalController {
  constructor(
    private readonly eventService: PLEventsService,  
    private readonly eventGuestsService: PLEventGuestsService,
    private readonly locationService: PLEventLocationsService,
    private readonly locationAssociationService: PLEventLocationAssociationService
  ) {}

  @Api(server.route.getPLEventGuestsByLocation)
  @ApiOkResponseFromZod(ResponsePLEventGuestSchemaWithRelationsSchema)
  async fetchEventGuests(
    @Param("uid") locationUid,
    @Req() request: Request
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponsePLEventGuestSchemaWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    if (request.query.searchBy) {
      delete builtQuery.where?.searchBy;
      builtQuery.where = {
        AND: [
          builtQuery.where,
          this.eventGuestsService.buildSearchFilter(request.query),
        ]
      };
    }
    return await this.eventGuestsService.getPLEventGuestsByLocation(locationUid, builtQuery);
  }

  /**
   * Creates a new PLEventLocationAssociation.
   * 
   * @param body - The data to create the association.
   * @returns The created association object.
   * @throws {BadRequestException} - If the association is not created.
   */
  @Api(server.route.createLocationAssociation)
  @UsePipes(ZodValidationPipe)
  @ApiOkResponseFromZod(ResponsePLEventLocationAssociationWithRelationsSchema)
  async createLocationAssociation(
    @Body() body: createLocationAssociationSchemaDto
  ) {
    return await this.locationAssociationService.createPLEventLocationAssociation(body);
  }

  /**
   * Retrieves all PLEventLocationAssociations.
   * 
   * @returns The array of association objects.
   */
  @Api(server.route.getAllPLEventLocationAssociations)
  @ApiOkResponseFromZod(ResponsePLEventLocationAssociationWithRelationsSchema.array())
  async getAllPLEventLocationAssociations() {
    return await this.locationAssociationService.findAllPLEventLocationAssociations();
  }

  /**
   * Retrieves a PLEventLocationAssociation by UID.
   * 
   * @param uid - The unique identifier of the association to retrieve.
   * @returns The association object.
   * @throws {NotFoundException} - If the association is not found.
   */
  @Api(server.route.getPLEventLocationAssociation)
  @ApiOkResponseFromZod(ResponsePLEventLocationAssociationWithRelationsSchema)
  async getPLEventLocationAssociation(
    @Param('uid') uid: string
  ) {
    return await this.locationAssociationService.findLocationAssociationByUid(uid);
  }

  /**
   * Updates a PLEventLocationAssociation by UID.
   * 
   * @param uid - The unique identifier of the association to update.
   * @param body - The data to update.
   * @returns The updated association object.
   * @throws {NotFoundException} - If the association is not found.
   */
  @Api(server.route.updatePLEventLocationAssociation)
  @UsePipes(ZodValidationPipe)
  @ApiOkResponseFromZod(ResponsePLEventLocationAssociationWithRelationsSchema)
  async updatePLEventLocationAssociation(
    @Param('uid') uid: string,
    @Body() body: UpdatePLEventLocationAssociationSchemaDto
  ) {
    return await this.locationAssociationService.updatePLEventLocationAssociation(uid, body);
  }

  /**
   * Deletes a PLEventLocationAssociation by UID.
   * 
   * @param uid - The unique identifier of the association to delete.
   * @returns The deleted association object.
   * @throws {NotFoundException} - If the association is not found.
   */
  @Api(server.route.deletePLEventLocationAssociation)
  @ApiOkResponseFromZod(ResponsePLEventLocationAssociationWithRelationsSchema)
  async deletePLEventLocationAssociation(
    @Param('uid') uid: string
  ) {
    return await this.locationAssociationService.deletePLEventLocationAssociation(uid);
  }

  /**
   * Creates a new PLEventLocation.
   * 
   * @param body - The data to create the location.
   * @returns The created location object.
   * @throws {BadRequestException} - If the location is not created.
   */
  @Api(server.route.createPLEventLocation)
  @UsePipes(ZodValidationPipe)
  @ApiOkResponseFromZod(ResponsePLEventLocationSchema)
  async createPLEventLocation(
    @Body() body: CreatePLEventLocationSchemaDto
  ) {
    return await this.locationService.createPLEventLocation(body);
  }

  /**
   * Retrieves all PLEventLocations.
   * 
   * @returns The array of location objects.
   */
  @Api(server.route.getAllPLEventLocations)
  @ApiOkResponseFromZod(ResponsePLEventLocationSchema.array())
  async getAllPLEventLocations() {
    return await this.locationService.findAllPLEventLocations();
  }

  /**
   * Retrieves a PLEventLocation by UID.
   * 
   * @param uid - The unique identifier of the location to retrieve.
   * @returns The location object.
   * @throws {NotFoundException} - If the location is not found.
   */
  @Api(server.route.getPLEventLocation)
  @ApiOkResponseFromZod(ResponsePLEventLocationSchema)
  async getPLEventLocation(
    @Param('uid') uid: string
  ) {
    return await this.locationService.findOnePLEventLocation(uid);
  }

  /**
   * Updates a PLEventLocation by UID.
   * 
   * @param uid - The unique identifier of the location to update.
   * @param body - The data to update.
   * @returns The updated location object.
   * @throws {NotFoundException} - If the location is not found.
   */
  @Api(server.route.updatePLEventLocation)
  @UsePipes(ZodValidationPipe)
  @ApiOkResponseFromZod(ResponsePLEventLocationSchema)
  async updatePLEventLocation(
    @Param('uid') uid: string,
    @Body() body: UpdatePLEventLocationSchemaDto
  ) {
    return await this.locationService.updatePLEventLocation(uid, body);
  }

  /**
   * Deletes a PLEventLocation by UID.
   * 
   * @param uid - The unique identifier of the location to delete.
   * @returns The deleted location object.
   * @throws {NotFoundException} - If the location is not found.
   */
  @Api(server.route.deletePLEventLocation)
  @ApiOkResponseFromZod(ResponsePLEventLocationSchema)
  async deletePLEventLocation(
    @Param('uid') uid: string
  ) {
    return await this.locationService.deletePLEventLocation(uid);
  }
}
