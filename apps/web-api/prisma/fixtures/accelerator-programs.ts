import { faker } from '@faker-js/faker';

export const acceleratorPrograms = [
  'Cypher',
  'Faber',
  'Longhash',
  'Outlier Ventures',
  'Tachyon',
  'Y Combinator',
].map((acceleratorProgram) => ({
  uid: faker.helpers.slugify(`uid-${acceleratorProgram.toLowerCase()}`),
  title: acceleratorProgram,
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
}));
