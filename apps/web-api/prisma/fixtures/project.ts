/* eslint-disable prettier/prettier */
import { faker } from '@faker-js/faker';
import { Prisma, Project } from '@prisma/client';
import { Factory } from 'fishery';
import camelCase from 'lodash/camelCase';
import sample from 'lodash/sample';
import { prisma } from './../index';

const getUidsFrom = async (model, where = {}) => {
  return await prisma[camelCase(model)].findMany({
    select: {
      uid: true,
    },
    where,
  });
};

const ProjectFactory = Factory.define<Omit<Project, 'id'>>(
  ({ sequence, onCreate }) => {
    onCreate(async (project) => {
      const teamUids = await (await getUidsFrom(Prisma.ModelName.Team))
        .map((result) => result.uid);
      project.teamUid = sample(teamUids) || '';
      const memberUids = await (await getUidsFrom(Prisma.ModelName.Member))
        .map((result) => result.uid);
      project.createdBy = sample(memberUids) || '';
      const imageUids = await (await getUidsFrom(Prisma.ModelName.Image, { thumbnailToUid: null }))
        .map((result) => result.uid);
      project.logoUid = sample(imageUids) || '';
      return project;
    });
    const name = faker.helpers.unique(faker.name.firstName);
    return {
      uid: faker.helpers.slugify(`uid-${name.toLowerCase()}`),
      logoUid: '',
      name: name,
      tagline: faker.lorem.words(3),
      description: faker.lorem.paragraph(),
      contactEmail: faker.internet.email(),
      lookingForFunding: false,
      kpis: [{ key: faker.random.word(), value: faker.random.word()}],
      readMe: faker.lorem.paragraph(),
      createdBy: '',
      teamUid: '', 
      projectLinks: [{
        name: faker.company.name(),
        url: faker.internet.url()
      }, 
      { 
        name: faker.company.name(),
        url: faker.internet.url() 
      }],
      createdAt: faker.date.past(),
      updatedAt: faker.date.recent()
    };
  }
);

export const projects = async () => await ProjectFactory.createList(300);
