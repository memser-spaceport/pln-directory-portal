import { faker } from '@faker-js/faker';
import { FundingStage, Team } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

async function createFundingStage() {
  const fundingStageFactory = Factory.define<Omit<FundingStage, 'id'>>(
    ({ sequence }) => ({
      uid: `funding-stage-${sequence}`,
      title: 'Funding Stage Title',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );

  const fundingStage = await fundingStageFactory.build();
  await prisma.fundingStage.create({ data: fundingStage });

  return fundingStage;
}

export async function createTeam({ amount }: TestFactorySeederParams) {
  const fundingStage = await createFundingStage();

  const teamFactory = Factory.define<Omit<Team, 'id'>>(({ sequence }) => {
    const team = {
      uid: `uid-${sequence}`,
      name: `Team ${sequence}`,
      logoUid: null,
      blog: faker.internet.url(),
      website: faker.internet.url(),
      contactMethod: faker.internet.url(),
      twitterHandler: faker.name.firstName(),
      shortDescription: faker.lorem.sentence(),
      longDescription: faker.lorem.paragraph(),
      plnFriend: true,
      airtableRecId: `airtable-rec-id-${sequence}`,
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
