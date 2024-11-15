import { Test, TestingModule } from '@nestjs/testing';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { MembersService } from '../members/members.service';
import { HuskyService } from '../husky/husky.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ResponseDiscoveryQuestionSchema } from '@protocol-labs-network/contracts';

describe('HomeController', () => {
  let homeController: HomeController;
  let homeService: HomeService;
  let membersService: MembersService;
  let huskyService: HuskyService;
  let prismaQueryBuilder: PrismaQueryBuilder;

  beforeEach(async () => {
    const prismaQueryBuilderMock = {
      build: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HomeController],
      providers: [
        {
          provide: HomeService,
          useValue: { fetchAllFeaturedData: jest.fn() },
        },
        {
          provide: MembersService,
          useValue: {
            findMemberByEmail: jest.fn(),
            checkIfAdminUser: jest.fn(),
          },
        },
        {
          provide: PrismaQueryBuilder,
          useValue: prismaQueryBuilderMock,
        },
        {
          provide: HuskyService,
          useValue: {
            fetchDiscoverQuestions: jest.fn(),
            fetchDiscoverQuestionBySlug: jest.fn(),
            createDiscoverQuestion: jest.fn(),
            updateDiscoveryQuestionBySlug: jest.fn(),
            updateDiscoveryQuestionShareCount: jest.fn(),
            updateDiscoveryQuestionViewCount: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(UserTokenValidation)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    homeController = module.get<HomeController>(HomeController);
    homeService = module.get<HomeService>(HomeService);
    membersService = module.get<MembersService>(MembersService);
    huskyService = module.get<HuskyService>(HuskyService);
    prismaQueryBuilder = new PrismaQueryBuilder(ResponseDiscoveryQuestionSchema as any);
  });

  it('should return all featured data', async () => {
    const mockData = { members: [], teams: [], events: [], projects: [] };
    jest.spyOn(homeService, 'fetchAllFeaturedData').mockResolvedValue(mockData);

    const result = await homeController.getAllFeaturedData();
    expect(result).toEqual(mockData);
    expect(homeService.fetchAllFeaturedData).toHaveBeenCalled();
  });

  it('should throw ForbiddenException if user is not admin in addDiscoveryQuestion', async () => {
    jest.spyOn(membersService, 'findMemberByEmail').mockResolvedValue({ email: 'test@example.com' } as any);
    jest.spyOn(membersService, 'checkIfAdminUser').mockReturnValue(false);

    await expect(homeController.addDiscoveryQuestion({} as any, { userEmail: 'test@example.com' })).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should create a discovery question if user is admin', async () => {
    const mockMember = { email: 'test@example.com' };
    jest.spyOn(membersService, 'findMemberByEmail').mockResolvedValue(mockMember as any);
    jest.spyOn(membersService, 'checkIfAdminUser').mockReturnValue(true);

    await homeController.addDiscoveryQuestion({} as any, { userEmail: 'test@example.com' });

    expect(membersService.findMemberByEmail).toHaveBeenCalledWith('test@example.com');
    expect(membersService.checkIfAdminUser).toHaveBeenCalledWith(mockMember);
    expect(huskyService.createDiscoverQuestion).toHaveBeenCalledWith({}, mockMember);
  });

  it('should throw BadRequestException for invalid attribute in modifyDiscoveryQuestionShareCountOrViewCount', async () => {
    await expect(
      homeController.modifyDiscoveryQuestionShareCountOrViewCount('slug1', { attribute: 'invalid' })
    ).rejects.toThrow(BadRequestException);
  });

  it('should update view count for valid attribute in modifyDiscoveryQuestionShareCountOrViewCount', async () => {
    await homeController.modifyDiscoveryQuestionShareCountOrViewCount('slug1', { attribute: 'viewCount' });
    expect(huskyService.updateDiscoveryQuestionViewCount).toHaveBeenCalledWith('slug1');
  });

  it('should call fetchDiscoverQuestions with the correct built query', async () => {
    // Arrange
    const mockRequest: any = { query: { field: 'value' } };
    const mockQueryResult: any = { someField: 'someValue' };
    const mockResponse: any = [{ id: 1, question: 'Sample question' }];

    // Spy on the build method of PrismaQueryBuilder instance
    jest.spyOn(prismaQueryBuilder, 'build').mockReturnValue(mockQueryResult);
    jest.spyOn(huskyService, 'fetchDiscoverQuestions').mockResolvedValue(mockResponse);

    // Act
    const result = await homeController.getDiscoveryQuestions(mockRequest);

    // Assert
    expect(prismaQueryBuilder.build).toBeCalledTimes(1)
    expect(huskyService.fetchDiscoverQuestions).toHaveBeenCalledWith(mockQueryResult);
    expect(result).toEqual(mockResponse);
  });
});
