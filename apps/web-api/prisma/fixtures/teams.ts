import { faker } from '@faker-js/faker';
import { Prisma, Team } from '@prisma/client';
import { Factory } from 'fishery';
import { camelCase, random } from 'lodash';
import sample from 'lodash/sample';
import sampleSize from 'lodash/sampleSize';
import { prisma } from './../index';

const getUidsFrom = async (model, where = {}) => {
  return await prisma[camelCase(model)].findMany({
    select: {
      uid: true,
    },
    where,
  });
};

const teamsFactory = Factory.define<Team>(({ sequence, onCreate }) => {
  onCreate(async (team) => {
    const fundingStageUids = await (
      await getUidsFrom(Prisma.ModelName.FundingStage)
    ).map((result) => result.uid);
    team.fundingStageUid = sample(fundingStageUids) || '';
    const imageUids = await (
      await getUidsFrom(Prisma.ModelName.Image, { thumbnailToUid: null })
    ).map((result) => result.uid);
    team.logoUid = sample(imageUids) || '';
    return team;
  });

  const companyName = faker.helpers.unique(faker.company.name);
  return {
    id: sequence,
    uid: faker.helpers.slugify(`uid-${companyName.toLowerCase()}`),
    name: companyName,
    logoUid: null,
    blog: faker.internet.url(),
    website: faker.internet.url(),
    twitterHandler: faker.name.firstName(),
    shortDescription: faker.lorem.sentence(),
    longDescription: faker.lorem.paragraph(),
    filecoinUser: faker.datatype.boolean(),
    ipfsUser: faker.datatype.boolean(),
    plnFriend: faker.datatype.boolean(),
    startDate: faker.date.past(),
    endDate: faker.date.recent(),
    createdAt: faker.date.past(),
    updatedAt: faker.date.recent(),
    fundingStageUid: null,
  };
});

export const teams = async () => await teamsFactory.createList(300);

export const teamRelations = async (teams) => {
  const industryTagUids = await getUidsFrom(Prisma.ModelName.IndustryTag);
  const acceleratorProgramUids = await getUidsFrom(
    Prisma.ModelName.AcceleratorProgram
  );
  const technologyUids = await getUidsFrom(Prisma.ModelName.Technology);

  return teams.map((team) => {
    const randomTechnologies = sampleSize(
      technologyUids,
      random(0, technologyUids.length)
    );

    return {
      where: {
        id: team.id,
      },
      data: {
        industryTags: {
          connect: sampleSize(industryTagUids, 3),
        },
        acceleratorPrograms: {
          connect: sampleSize(acceleratorProgramUids, 3),
        },
        ...(randomTechnologies.length && {
          technologies: { connect: randomTechnologies },
        }),
      },
    };
  });
};
