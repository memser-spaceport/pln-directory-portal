import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';
import { Skill } from '@prisma/client';

export const skillFactory = Factory.define<Skill>(({ sequence }) => ({
  id: sequence,
  uid: `uid-${sequence}`,
  title: `Skill ${sequence}`,
  description: `Skill ${sequence} description`,
  createdAt: new Date(),
  updatedAt: new Date(),
}));

export const skills = [
  'AI',
  'Cryptoeconomics',
  'Education',
  'Engineering',
  'Finance',
  'Fundraising',
  'Legal',
  'Management',
  'Marketing & Creative',
  'Operations',
  'People',
  'Product',
  'Recruiting',
  'Research',
  'Strategy',
  'Tax',
].map((skill) =>
  skillFactory.build({
    uid: faker.helpers.slugify(`uid-${skill.toLowerCase()}`),
    title: skill,
    description: faker.lorem.sentence(),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
  })
);
