import { faker } from '@faker-js/faker';

export const communityAffiliations = [
  'PL Portfolio',
  'YC',
  'A16Z',
  'Orange DAO',
  'Longhash',
  'Outlier Ventures',
  'Tachyon',
  'Techstars',
  'Alliance',
  'Founder School',
  'Cypher',
  'Faber',
  'Aleph Crecimiento',
  'Edge City',
  'PL Genesis',
].map((communityAffiliation) => ({
  uid: faker.helpers.slugify(`uid-${communityAffiliation.toLowerCase()}`),
  title: communityAffiliation,
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
}));
