import { faker } from '@faker-js/faker';

export const membershipSources = [
  'Cypher',
  'Faber',
  'Longhash',
  'Outlier Ventures',
  'Tachyon',
  'Y Combinator',
].map((membershipSource) => ({
  uid: faker.helpers.slugify(`uid-${membershipSource.toLowerCase()}`),
  title: membershipSource,
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
}));
