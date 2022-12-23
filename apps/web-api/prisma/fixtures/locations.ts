import { faker } from '@faker-js/faker';
import { Location } from '@prisma/client';
import { Factory } from 'fishery';
import sample from 'lodash/sample';

const countriesByContinents = [
  {
    Africa: [
      'Nigeria',
      'Ethiopia',
      'Egypt',
      'Democratic Republic of the Congo',
      'Tanzania',
    ],
  },
  {
    Asia: ['Russia', 'China', 'India', 'Kazakhstan', 'Saudi Arabia'],
  },
  {
    'South America': ['Brazil', 'Colombia', 'Argentina', 'Peru', 'Venezuela'],
  },
  {
    'North America': ['United States', 'Mexico', 'Canada', 'Guatemala', 'Cuba'],
  },
  {
    Europe: ['Germany', 'France', 'United Kingdom', 'Italy', 'Spain'],
  },
  {
    Australia: [
      'Australia',
      'Papua New Guinea',
      'New Zealand',
      'Fiji',
      'Solomon Islands',
    ],
  },
];

const locationsFactory = Factory.define<Omit<Location, 'id'>>(
  ({ sequence }) => {
    const random = sample(countriesByContinents) || {};
    const continent = Object.keys(random)[0];
    const country = sample(random[continent]);
    const city = faker.helpers.unique(faker.address.city);

    return {
      uid: faker.helpers.slugify(`uid-${city.toLowerCase()}`),
      city,
      country,
      continent,
      region: faker.address.state(),
      regionAbbreviation: faker.address.stateAbbr(),
      formattedAddress: faker.address.streetAddress(),
      latitude: Number(faker.address.latitude()),
      longitude: Number(faker.address.longitude()),
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent(),
    };
  }
);

export const locations = locationsFactory.buildList(250);
