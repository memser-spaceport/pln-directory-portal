import { faker } from '@faker-js/faker';
import { FundingStage, Team } from '@prisma/client';
import { Factory } from 'fishery';
import { prisma } from '../../../prisma/__mocks__/index';
import { TestFactorySeederParams } from '../../utils/factory-interfaces';

async function createFundingStage(title) {
  const fundingStageFactory = Factory.define<Omit<FundingStage, 'id'>>(
    ({ sequence }) => ({
      uid: `funding-stage-${sequence}`,
      title,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );

  const fundingStage = await fundingStageFactory.build();
  await prisma.fundingStage.create({ data: fundingStage });

  return fundingStage;
}

export async function createTeam({ amount }: TestFactorySeederParams) {
  const fundingStage = await createFundingStage('Funding Stage Title');

  const teamFactory = Factory.define<Omit<Team, 'id'>>(({ sequence }) => {
    const team = {
      uid: `uid-${sequence}`,
      name: `Team ${sequence}`,
      logoUid: 'uid-1',
      blog: faker.internet.url(),
      website: faker.internet.url(),
      contactMethod: faker.internet.url(),
      moreDetails: faker.lorem.paragraph(),
      linkedinHandler: faker.internet.url(),
      officeHours: faker.internet.url(),
      twitterHandler: faker.name.firstName(),
      telegramHandler: faker.name.firstName(),
      shortDescription: faker.lorem.sentence(),
      longDescription: faker.lorem.paragraph(),
      plnFriend: true,
      isFeatured: true,
      airtableRecId: `airtable-rec-id-${sequence}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      fundingStageUid: fundingStage.uid,
      lastModifiedBy: null
    };

    return team;
  });

  const teams = await teamFactory.buildList(amount);
  await prisma.team.createMany({
    data: teams,
  });
}

export async function getUpdateTeamPayload() {
  return {
    participantType: 'TEAM',
    referenceUid: 'uid-1',
    uniqueIdentifier: 'name-1',
    newData: {
      name: 'name-1',
      logoUid: 'uid-1',
      shortDescription: faker.lorem.sentence(),
      longDescription: faker.lorem.paragraph(),
      technologies: [
        { uid: 'uid-1', title: 'Technology 1' }
      ],
      fundingStage: { uid: 'uid-1', title: 'Funding Stage 1' },
      membershipSources: [
        { uid: 'uid-1', title: 'Membership Source 1' }
      ],
      industryTags: [
        { uid: 'uid-1', title: 'Industry Category Title 1' }
      ],
      contactMethod: faker.internet.email(),
      website: faker.internet.url(),
      linkedinHandler: faker.name.firstName(),
      telegramHandler: faker.name.firstName(),
      twitterHandler: faker.name.firstName(),
      blog: faker.internet.url(),
      officeHours: faker.name.firstName(),
      fundingStageUid: 'uid-1',
      oldName: faker.name.firstName(),
      logoUrl: faker.internet.url(),
    },
  };
}
