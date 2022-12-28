import { Injectable } from '@nestjs/common';
import { IAirtableMember } from '@protocol-labs-network/airtable';
import axios from 'axios';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class LocationTransferService {
  constructor(private prismaService: PrismaService) {}

  // TODO: Refactor this function to improve readability and maintainability
  async transferLocation(member: IAirtableMember) {
    const hasCityCountryFields =
      member.fields['City'] || member.fields['Country'];
    const hasProvidedLocation =
      (member.fields['City'] &&
        member.fields['City'].toLowerCase() !== 'not provided') ||
      (member.fields['Country'] &&
        member.fields['Country'].toLowerCase() !== 'not provided');

    if (!hasCityCountryFields || !hasProvidedLocation) {
      return { status: 'NOT_PROVIDED' };
    }
    const city =
      member.fields['City'] &&
      member.fields['City'].toLowerCase() !== 'not provided'
        ? member.fields['City']
        : '';
    const country =
      member.fields['Country'] &&
      member.fields['Country'].toLowerCase() !== 'not provided'
        ? member.fields['Country']
        : '';
    /**
     * Looking for the same city and country in the same string is not working
     * we should strip one if they are the same
     */
    const searchString = city === country ? country : `${city} ${country}`;

    let placeResponse;
    try {
      placeResponse = await axios.get(
        `https://maps.googleapis.com/maps/api/place/queryautocomplete/json?input=${encodeURIComponent(
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

    /**
     * This catches the islands like Kauai, Maui, etc
     */
    let requiredPlace =
      placeResponse.data.predictions &&
      placeResponse.data.predictions.find(
        (place) =>
          place.types && place.types.find((type) => type === 'natural_feature')
      );

    if (!requiredPlace)
      requiredPlace =
        placeResponse.data.predictions &&
        placeResponse.data.predictions.find(
          (place) =>
            place.types && place.types.find((type) => type === 'locality')
        );

    if (!requiredPlace)
      requiredPlace =
        placeResponse.data.predictions &&
        placeResponse.data.predictions.find(
          (place) =>
            place.types &&
            place.types.find((type) => type === 'administrative_area_level_1')
        );
    if (!requiredPlace)
      requiredPlace =
        placeResponse.data.predictions &&
        placeResponse.data.predictions.find(
          (place) =>
            place.types && place.types.find((type) => type === 'country')
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

    const finalResult = {
      placeId: placeDetails.data.results[0].place_id,
      city: apiCity ? apiCity.long_name : null,
      country: apiCountry ? apiCountry.long_name : null,
      continent: member.fields.Region ? member.fields.Region : 'Not Defined',
      region: apiState ? apiState.long_name : null,
      regionAbbreviation: apiState ? apiState.short_name : null,
      metroArea: apiState ? apiState.long_name : null,
      latitude: lat,
      longitude: lng,
    };

    const location = await this.prismaService.location.upsert({
      where: {
        placeId: finalResult.placeId,
      },
      update: {},
      create: finalResult,
    });

    return { status: 'OK', location };
  }
}
