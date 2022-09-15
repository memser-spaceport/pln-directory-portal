import { faker } from '@faker-js/faker';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FundingStage, Team } from '@prisma/client';
import { Factory } from 'fishery';
import supertest from 'supertest';
import { TeamSchema } from '../../../../libs/contracts/src/lib/contract-team';
import { prisma } from '../../prisma/index';
import { TeamsModule } from './teams.module';

describe('TeamsService', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TeamsModule],
    }).compile();
    app = moduleRef.createNestApplication();

    await app.init();

    const fundingStageFactory = Factory.define<FundingStage>(
      ({ sequence }) => ({
        id: sequence,
        uid: `funding-stage-${sequence}`,
        title: 'Funding Stage Title',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    );

    const fundingStage = await fundingStageFactory.build();
    await prisma.fundingStage.create({ data: fundingStage });

    const teamFactory = Factory.define<Team>(({ sequence }) => {
      const team = {
        id: sequence,
        uid: `uid-${sequence}`,
        name: `Team ${sequence}`,
        logo: 'logo',
        blog: faker.internet.url(),
        website: faker.internet.url(),
        twitterHandler: faker.name.firstName(),
        shortDescripton: faker.lorem.sentence(),
        longDescripton: faker.lorem.paragraph(),
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

    const teams = await teamFactory.buildList(5);
    await prisma.team.createMany({
      data: teams,
    });
  });

  it('should list teams with a valid schema', async () => {
    const response = await supertest(app.getHttpServer())
      .get('/teams')
      .expect(200);
    const teams = response.body;
    const hasValidSchema = TeamSchema.safeParse(teams[0]).success;
    expect(hasValidSchema).toBeTruthy();
  });
});
