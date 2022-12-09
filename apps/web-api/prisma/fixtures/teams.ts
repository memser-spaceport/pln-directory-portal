import sample from 'lodash/sample';
import sampleSize from 'lodash/sampleSize';
import { Factory } from 'fishery';
import { faker } from '@faker-js/faker';
import { prisma } from './../index';
import { Team } from '@prisma/client';

const getFundingStageUids = async () => {
  return await prisma.fundingStage.findMany({
    select: {
      uid: true,
    },
  });
};

const teamsFactory = Factory.define<Team>(({ sequence, onCreate }) => {
  onCreate(async (team) => {
    const fundingStageUids = await (
      await getFundingStageUids()
    ).map((result) => result.uid);
    team.fundingStageUid = sample(fundingStageUids);
    return team;
  });

  const companyName = faker.helpers.unique(faker.company.name);
  return {
    id: sequence,
    uid: faker.helpers.slugify(`uid-${companyName.toLowerCase()}`),
    name: companyName,
    logo: faker.image.animals(),
    blog: faker.internet.url(),
    website: faker.internet.url(),
    twitterHandler: faker.name.firstName(),
    shortDescripton: faker.lorem.sentence(),
    longDescripton: faker.lorem.paragraph(),
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

const getIndustryTagUids = async () => {
  return await prisma.industryTag.findMany({
    select: {
      uid: true,
    },
  });
};

const getAcceleratorProgramUids = async () => {
  return await prisma.acceleratorProgram.findMany({
    select: {
      uid: true,
    },
  });
};

export const teamRelations = async (teams) => {
  const industryTagUids = await getIndustryTagUids();
  const acceleratorProgramUids = await getAcceleratorProgramUids();

  return teams.map((team) => ({
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
    },
  }));
};
