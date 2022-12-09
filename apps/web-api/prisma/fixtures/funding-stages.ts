import { faker } from '@faker-js/faker';

export const fundingStages = [
  'Pre-seed',
  'Seed',
  'Series A',
  'Series B',
  'Series C',
  'Series D',
].map((fundingStage) => ({
  uid: faker.helpers.slugify(`uid-${fundingStage.toLowerCase()}`),
  title: fundingStage,
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
}));
