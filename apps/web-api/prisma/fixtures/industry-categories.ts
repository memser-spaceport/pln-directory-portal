import { faker } from '@faker-js/faker';

export const industryCategories = [
  'Developer Tooling',
  'Use Case: Applications',
  'Ecosystem',
  'R&D',
  'Other',
].map((industryCategory) => ({
  uid: faker.helpers.slugify(`uid-${industryCategory.toLowerCase()}`),
  title: industryCategory,
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
}));
