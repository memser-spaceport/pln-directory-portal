import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma.service';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

describe('TeamsService', () => {
  let service: TeamsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [TeamsService, PrismaService],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  it('should be defined', async () => {
    const result: any = [
      {
        id: 1,
        uid: '1',
        name: 'Team 1',
        logo: 'logo',
        blog: 'blog',
        website: 'website',
        twitterHandler: 'twitterHandler',
        shortDescripton: 'shortDescripton',
        longDescripton: 'longDescripton',
        filecoinUser: true,
        ipfsUser: true,
        plnFriend: true,
        startDate: new Date(),
        endDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        fundingStageUid: 'fundingStageUid',
      },
    ];
    jest.spyOn(service, 'findAll').mockImplementation(() => result);

    expect(await service.findAll()).toBe(result);
  });
});
