import { faker } from '@faker-js/faker';
import { FundingStage, Team } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

async function createFundingStage() {
  const fundingStageFactory = Factory.define<FundingStage>(({ sequence }) => ({
    id: sequence,
    uid: `funding-stage-${sequence}`,
    title: 'Funding Stage Title',
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const fundingStage = await fundingStageFactory.build();
  await prisma.fundingStage.create({ data: fundingStage });

  return fundingStage;
}

export async function createTeam({ amount }: TestFactorySeederParams) {
  const fundingStage = await createFundingStage();

  const teamFactory = Factory.define<Team>(({ sequence }) => {
    const team = {
      id: sequence,
      uid: `uid-${sequence}`,
      name: `Team ${sequence}`,
      logo: 'logo',
      blog: faker.internet.url(),
      website: faker.internet.url(),
      twitterHandler: faker.name.firstName(),
      shortDescription: faker.lorem.sentence(),
      longDescription: faker.lorem.paragraph(),
      filecoinUser: true,
      ipfsUser: true,
      plnFriend: true,
      startDate: new Date(),
      endDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      fundingStageUid: fundingStage.uid,
    };

    return team;
  });

  const teams = await teamFactory.buildList(amount);
  await prisma.team.createMany({
    data: teams,
  });
}
