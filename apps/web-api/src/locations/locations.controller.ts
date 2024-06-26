import { Controller, Req, Body, UsePipes, BadRequestException, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiLocations } from '../../../../libs/contracts/src/lib/contract-locations';
import { LocationsService } from './locations.service';
import {
  LocationQueryParams,
  LocationResponseSchema,
  ValidateLocationDto
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { Request } from 'express';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { ZodValidationPipe } from 'nestjs-zod';
import { GoogleRecaptchaGuard } from '../guards/google-recaptcha.guard';

const server = initNestServer(apiLocations);

@Controller()
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Api(server.route.getLocations)
  @ApiQueryFromZod(LocationQueryParams)
  @ApiOkResponseFromZod(LocationResponseSchema.array())
  async findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      LocationResponseSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.locationsService.findAll(builtQuery);
  }

  @Api(server.route.validateLocation)
  // @UseGuards(GoogleRecaptchaGuard)
  @UsePipes(ZodValidationPipe)
  async create(
    @Body() body: ValidateLocationDto
  ): Promise<any> {
    const result = await this.locationsService.validateLocation(body);
    if (!result || !result?.location) {
      throw new BadRequestException('Invalid Location Info');
    }
    return result;
  }
}
