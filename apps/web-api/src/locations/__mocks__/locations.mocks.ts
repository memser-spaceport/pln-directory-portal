import { faker } from '@faker-js/faker';
import { Location } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

export async function createLocation({ amount }: TestFactorySeederParams) {
  const locationFactory = Factory.define<Omit<Location, 'id'>>(
    ({ sequence }) => ({
      uid: `location-${sequence}`,
      city: `city-${sequence}`,
      country: `country-${sequence}`,
      continent: `continent-${sequence}`,
      latitude: Number(faker.random.numeric(2, { allowLeadingZeros: true })),
      longitude: Number(faker.random.numeric(2, { allowLeadingZeros: true })),
      region: `region-${sequence}`,
      metroArea: `metroArea-${sequence}`,
      placeId: `placeId-${sequence}`,
      regionAbbreviation: `regionAbbreviation-${sequence}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );

  const locations = await locationFactory.buildList(amount);
  await prisma.location.createMany({
    data: locations,
  });
}
