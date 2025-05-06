import { Factory } from 'fishery';
import sample from 'lodash/sample';
import { Prisma } from '@prisma/client';
import { faker } from '@faker-js/faker';
import camelCase from 'lodash/camelCase';
import random from 'lodash/random';
import sampleSize from 'lodash/sampleSize';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

export const projectFields = (sequence: number, name: string) => {
  return {
    uid: `uid-project-${sequence}`,
    logoUid: 'uid-1',
    name: name,
    tagline: faker.lorem.words(3),
    description: faker.lorem.paragraph(),
    contactEmail: faker.internet.email().toLowerCase(),
    lookingForFunding: false,
    kpis: [{ key: faker.random.word(), value: faker.random.word()}],
    readMe: faker.lorem.paragraph(),
    createdBy: 'uid-1',
    maintainingTeamUid: 'uid-1',
    projectLinks: [
      {
        name: faker.company.name(),
        url: faker.internet.url(),
      },
      {
        name: faker.company.name(),
        url: faker.internet.url(),
      },
    ],
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    isDeleted: false,
  } as Prisma.ProjectCreateManyInput;
};

export async function createProject({ amount }: TestFactorySeederParams) {
  const getUidsFrom = async (model, where = {}) => {
    return await prisma[camelCase(model)].findMany({
      select: {
        uid: true,
      },
      where,
    });
  };

  const ProjectFactory = Factory.define<Omit<Prisma.ProjectCreateManyInput, 'id'>>(
    ({ sequence, onCreate }) => {
      onCreate(async (project) => {
        const teamUids = await (
          await getUidsFrom(Prisma.ModelName.Team)
        ).map((result) => result.uid);
        project.maintainingTeamUid = sample(teamUids) || '';
        const memberUids = await (
          await getUidsFrom(Prisma.ModelName.Member)
        ).map((result) => result.uid);
        // project.createdBy = sample(memberUids) || '';
        project.createdBy = 'uid-1' || '';
        const imageUids = await (
          await getUidsFrom(Prisma.ModelName.Image, { thumbnailToUid: null })
        ).map((result) => result.uid);
        project.logoUid = sample(imageUids) || '';
        return project;
      });
      const name = faker.helpers.unique(faker.name.firstName);
      return projectFields(sequence, name);
    }
  );

  const projects = await ProjectFactory.createList(amount);

  const projectRelations = async (projects) => {
    const teamUids = await (await getUidsFrom(Prisma.ModelName.Team));
    return projects.map((project) => {
      const randomTeams = sampleSize(teamUids, random(0, 5));
      return {
        where: {
          uid: project.uid,
        },
        data: {
          ...(randomTeams.length && {
            contributingTeams: { connect: randomTeams },
          }),
        },
      };
    });
  };
  const relationsToConnect = await projectRelations(projects);
  await prisma.project.createMany({ data: projects });
  for (const relation of relationsToConnect) {
    await prisma.project.update(relation);
  }
}
