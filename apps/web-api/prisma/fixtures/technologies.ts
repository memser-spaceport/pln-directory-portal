import { faker } from '@faker-js/faker';

export const technologies = [
  'Filecoin',
  'IPFS',
  'libp2p',
  'IPLD',
  'drand',
  'FVM',
  'SourceCred',
].map((technology) => ({
  uid: faker.helpers.slugify(`uid-${technology.toLowerCase()}`),
  title: technology,
  createdAt: faker.date.past(),
  updatedAt: faker.date.recent(),
}));
