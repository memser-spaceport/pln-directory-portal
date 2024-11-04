import { Factory } from 'fishery';
import { PLEventLocation } from '@prisma/client';
import { faker } from '@faker-js/faker';

const eventLocationFactory = Factory.define<Omit<PLEventLocation, 'id'>>(({ onCreate }) => {
  onCreate(async (location) => { 
    return location;
  });
  return {
    uid: faker.datatype.uuid(),
    location: faker.address.city(),
    flag: faker.address.countryCode(),
    icon: faker.internet.url(),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    timezone: faker.address.timeZone(),
    latitude: faker.address.latitude(),
    longitude: faker.address.longitude(),
    priority: faker.datatype.number(),
    resources:  [{ url: faker.internet.url(), description: faker.lorem.sentence()}],
    additionalInfo: {}
  };
});

export const eventLocations = async () => await eventLocationFactory.createList(25);

