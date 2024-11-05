import { faker } from '@faker-js/faker';

// Seed data for predefined focus areas
export const focusAreas = [
  'Build Innovation Network',
  'Develop Advanced Technologies',
  'Public Goods',
  'Digital Human Rights',
].map((title) => ({
    uid: faker.helpers.slugify(`uid-${title.toLowerCase()}`),
    title,
    description: faker.lorem.sentence(),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
}));