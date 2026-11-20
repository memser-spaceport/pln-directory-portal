import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { IAirtableMember } from '@protocol-labs-network/airtable';
import axios from 'axios';
import { PrismaService } from '../../shared/prisma.service';

@Injectable()
export class LocationTransferService {
  constructor(private prismaService: PrismaService) {}

  async transferLocation(member: IAirtableMember) {
    const { status, location } = await this.fetchLocation(
      member.fields['City'],
      member.fields['Country'],
      member.fields.Region,
      member.fields['State / Province'],
      member.fields['Metro Area']
    );

    if (!location || status !== 'OK') {
      return { status };
    }

    const finalLocation = await this.prismaService.location.upsert({
      where: {
        placeId: location.placeId,
      },
      update: {},
      create: location,
    });

    return { status: 'OK', location: finalLocation };
  }

  // TODO: Refactor this function to improve readability and maintainability
  async fetchLocation(providedCity, providedCountry, providedContinent, providedRegion, providedMetroArea) {
    const hasCityCountryFields = providedCity || providedCountry;
    const hasProvidedLocation =
      (providedCity && providedCity.toLowerCase() !== 'not provided') ||
      (providedCountry && providedCountry.toLowerCase() !== 'not provided');

    if (!hasCityCountryFields || !hasProvidedLocation) {
      return { status: 'NOT_PROVIDED' };
    }
    const city = providedCity && providedCity.toLowerCase() !== 'not provided' ? providedCity : '';
    const country = providedCountry && providedCountry.toLowerCase() !== 'not provided' ? providedCountry : '';
    const region = providedRegion && providedCountry.toLowerCase() !== 'not provided' ? providedRegion : '';
    /**
     * Looking for the same city and country in the same string is not working
     * we should strip one if they are the same
     */
    const searchString = `${city} ${region} ${country}`;

    let placeResponse;
    try {
      placeResponse = await axios.get(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?types=(regions)&input=${encodeURIComponent(
          searchString
        )}&key=${process.env.GOOGLE_PLACES_API_KEY}`
      );
    } catch (error) {
      throw error;
    }
    if (placeResponse.data.status === 'ZERO_RESULTS') {
      return { status: placeResponse.data.status };
    }

    if (!placeResponse.data.predictions) {
      return { status: 'NO_PREDICTIONS' };
    }

    let requiredPlace;

    if (city) {
      requiredPlace =
        placeResponse.data.predictions &&
        placeResponse.data.predictions.find((place) => place.types && place.types.find((type) => type === 'locality'));
    }

    if (!requiredPlace && (city || region)) {
      requiredPlace =
        placeResponse.data.predictions &&
        placeResponse.data.predictions.find(
          (place) => place.types && place.types.find((type) => type === 'administrative_area_level_1')
        );
    }

    if (!requiredPlace)
      requiredPlace =
        placeResponse.data.predictions &&
        placeResponse.data.predictions.find((place) => place.types && place.types.find((type) => type === 'country'));

    /**
     * This catches the islands like Kauai, Maui, etc
     */
    if (!requiredPlace)
      requiredPlace =
        placeResponse.data.predictions &&
        placeResponse.data.predictions.find(
          (place) => place.types && place.types.find((type) => type === 'natural_feature')
        );

    if (!requiredPlace) {
      return { status: 'NO_REQUIRED_PLACE' };
    }

    let placeDetails;
    try {
      placeDetails = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json?place_id=${requiredPlace.place_id}&key=${process.env.GOOGLE_PLACES_API_KEY}`
      );
    } catch (error) {
      throw error;
    }

    if (placeResponse.data.status === 'OVER_QUERY_LIMIT') {
      return { status: placeResponse.data.status };
    }

    const apiCity = placeDetails.data.results[0].address_components.find(
      (component) => component.types[0] === 'locality'
    );
    const apiCountry = placeDetails.data.results[0].address_components.find(
      (component) => component.types[0] === 'country'
    );
    const apiState = placeDetails.data.results[0].address_components.find(
      (component) => component.types[0] === 'administrative_area_level_1'
    );
    const lat = placeDetails.data.results[0].geometry.location.lat;
    const lng = placeDetails.data.results[0].geometry.location.lng;

    /**
     * We are adding the metroArea to the placeId to avoid duplicates because
     * since the metroArea is not valid on the Google Places API we need to append this field to avoid rewriting the same location
     */
    const finalResult = {
      placeId: `${placeDetails.data.results[0].place_id}${
        !providedCity && providedMetroArea ? `-${providedMetroArea}` : ''
      }`,
      city: providedCity && apiCity ? apiCity.long_name : null,
      country: apiCountry ? apiCountry.long_name : null,
      continent: providedContinent ? providedContinent : 'Not Defined',
      region: providedRegion && apiState ? apiState.long_name : null,
      metroArea: providedMetroArea ? providedMetroArea : null,
      regionAbbreviation: providedRegion && apiState ? apiState.short_name : null,
      latitude: lat,
      longitude: lng,
    };

    return { status: 'OK', location: finalResult };
  }

  async autocompleteLocation(searchString: string) {
    if (!searchString || searchString.length < 3) {
      throw new BadRequestException('Search string must be at least 3 characters long');
    }

    const result = await axios.get(
      `https://maps.googleapis.com/maps/api/place/autocomplete/json?types=(regions)&input=${encodeURIComponent(
        searchString
      )}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );

    if (result.data.status === 'ZERO_RESULTS') {
      return [];
    }

    if (!result.data.predictions) {
      return [];
    }

    return result.data.predictions.map((prediction) => ({
      description: prediction.description,
      placeId: prediction.place_id,
    }));
  }

  async fetchLocationDetails(placeId: string) {
    const placeDetails = await axios.get(
      `https://maps.googleapis.com/maps/api/geocode/json?place_id=${placeId}&key=${process.env.GOOGLE_PLACES_API_KEY}`
    );

    const apiCity = placeDetails.data.results[0].address_components.find(
      (component) => component.types[0] === 'locality'
    );
    const apiCountry = placeDetails.data.results[0].address_components.find(
      (component) => component.types[0] === 'country'
    );
    const apiState = placeDetails.data.results[0].address_components.find(
      (component) => component.types[0] === 'administrative_area_level_1'
    );
    const lat = placeDetails.data.results[0].geometry.location.lat;
    const lng = placeDetails.data.results[0].geometry.location.lng;

    return {
      placeId,
      city: apiCity ? apiCity.long_name : null,
      country: apiCountry ? apiCountry.long_name : null,
      continent: 'Not Defined',
      region: apiState ? apiState.long_name : null,
      metroArea: null,
      regionAbbreviation: apiState ? apiState.short_name : null,
      latitude: lat,
      longitude: lng,
    };
  }

  /**
   * Place suggestions of any kind (venues and street addresses, not only regions), for the event submit form.
   * Up to 5, each with its text and a Google place id.
   */
  async searchVenues(query: string): Promise<Array<{ text: string; placeId: string }>> {
    const input = (query ?? '').trim();
    if (!input) {
      throw new BadRequestException('query is required');
    }
    const result = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
      params: { input, key: process.env.GOOGLE_PLACES_API_KEY },
    });
    const predictions = Array.isArray(result.data?.predictions) ? result.data.predictions : [];
    return predictions
      .filter((prediction) => prediction?.place_id && prediction?.description)
      .slice(0, 5)
      .map((prediction) => ({ text: prediction.description, placeId: prediction.place_id }));
  }

  /**
   * One place by its Google place id, or by an address text: the formatted address, its parts, the position, a map
   * link and the IANA time zone. A text that matches no place answers 404. A failed time zone lookup returns the
   * place with `timezone: null`.
   */
  async resolvePlace(input: { placeId?: string | null; address?: string | null }) {
    const placeId = (input.placeId ?? '').trim();
    const address = (input.address ?? '').trim();
    if (!placeId && !address) {
      throw new BadRequestException('placeId or address is required');
    }
    const geocode = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { ...(placeId ? { place_id: placeId } : { address }), key: process.env.GOOGLE_PLACES_API_KEY },
    });
    const place = geocode.data?.results?.[0];
    if (!place?.geometry?.location) {
      throw new NotFoundException('No place matches this address');
    }

    const components: Array<{ long_name: string; types: string[] }> = place.address_components ?? [];
    const part = (...types: string[]) =>
      components.find((component) => types.some((type) => component.types?.includes(type)))?.long_name ?? null;
    const latitude: number = place.geometry.location.lat;
    const longitude: number = place.geometry.location.lng;
    const resolvedPlaceId: string | null = place.place_id ?? (placeId || null);

    const mapQuery = new URLSearchParams({ api: '1', query: `${latitude},${longitude}` });
    if (resolvedPlaceId) mapQuery.set('query_place_id', resolvedPlaceId);

    return {
      placeId: resolvedPlaceId,
      address: (place.formatted_address as string | undefined) ?? null,
      city: part('locality', 'postal_town', 'administrative_area_level_2'),
      state: part('administrative_area_level_1'),
      country: part('country'),
      latitude,
      longitude,
      locationUrl: `https://www.google.com/maps/search/?${mapQuery.toString()}`,
      timezone: await this.fetchTimezone(latitude, longitude),
    };
  }

  /** The IANA time zone of a position (Google Time Zone API), or null when the lookup fails. */
  async fetchTimezone(latitude: number, longitude: number): Promise<string | null> {
    try {
      const result = await axios.get('https://maps.googleapis.com/maps/api/timezone/json', {
        params: {
          location: `${latitude},${longitude}`,
          timestamp: Math.floor(Date.now() / 1000),
          key: process.env.GOOGLE_PLACES_API_KEY,
        },
      });
      const timezone = result.data?.status === 'OK' ? result.data.timeZoneId : null;
      return typeof timezone === 'string' && timezone ? timezone : null;
    } catch {
      return null;
    }
  }
}
