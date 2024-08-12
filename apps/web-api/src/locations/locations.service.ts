import axios, { AxiosError } from 'axios';
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
@Injectable()
export class LocationsService {
  private readonly locationURL = process.env.LOCATION_API;
  constructor(
    private prisma: PrismaService,
    private locationTransferService:LocationTransferService
  ) {}

  findAll(queryOptions: Prisma.LocationFindManyArgs) {
    return this.prisma.location.findMany(queryOptions);
  }

  async validateLocation(location) {
    const { city, country, region } = location;
    if (city || country || region) {
      return await this.locationTransferService.fetchLocation(
        city,
        country,
        null,
        region,
        null
      );
    }
    return null;
  }

  private async fetchFromLocationApi(endpoint: string) {
    try {
      const response = await axios.get(`${this.locationURL}/${endpoint}`, {
        headers: { 'X-CSCAPI-KEY': process.env.LOCATION_API_KEY }
      });
      return response.data;
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  private handleAxiosError(error: AxiosError) {
    if (error.response) {
      throw new HttpException(
        `External API Error: ${error.response.statusText}`,
        error.response.status,
      );
    } else if (error.request) {
      throw new HttpException(
        'No response received from external API',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    } else {
      throw new HttpException(
        'Error setting up request to external API',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async fetchCountries(): Promise<string[]> {
    return this.fetchFromLocationApi('countries');
  }

  async fetchStates(): Promise<string[]> {
    return this.fetchFromLocationApi('states');
  }

  async fetchStatesByCountry(country: string): Promise<string[]> {
    return this.fetchFromLocationApi(`countries/${country}/states`);
  }

  async fetchCitiesByCountry(country: string): Promise<string[]> {
    return this.fetchFromLocationApi(`countries/${country}/cities`);
  }

  async fetchCitiesByCountryAndState(country: string, state: string): Promise<string[]> {
    return this.fetchFromLocationApi(`countries/${country}/states/${state}/cities`);
  }
}
