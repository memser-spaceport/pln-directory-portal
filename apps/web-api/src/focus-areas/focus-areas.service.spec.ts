import { Test, TestingModule } from '@nestjs/testing';
import { FocusAreasService } from './focus-areas.service';
import { PrismaService } from '../shared/prisma.service';
import { TeamsService } from '../teams/teams.service';
import { ProjectsService } from '../projects/projects.service';
import { TEAM, PROJECT } from '../utils/constants';

describe('FocusAreasService', () => {
  let service: FocusAreasService;
  let prismaService: PrismaService;
  let teamsService: TeamsService;
  let projectsService: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FocusAreasService,
        {
          provide: PrismaService,
          useValue: {
            focusArea: {
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: TeamsService,
          useValue: {
            buildTeamFilter: jest.fn(),
          },
        },
        {
          provide: ProjectsService,
          useValue: {
            buildProjectFilter: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<FocusAreasService>(FocusAreasService);
    prismaService = module.get<PrismaService>(PrismaService);
    teamsService = module.get<TeamsService>(TeamsService);
    projectsService = module.get<ProjectsService>(ProjectsService);
  });

  describe('findAll', () => {
    it('should retrieve all focus areas with TEAM type filter applied', async () => {
      const query = { type: TEAM };
      const mockFocusAreas: any = [{ id: 1, name: 'Focus Area 1' }];
      jest.spyOn(prismaService.focusArea, 'findMany').mockResolvedValue(mockFocusAreas);

      const result = await service.findAll(query);

      expect(prismaService.focusArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.any(Object),
          orderBy: { createdAt: 'desc' },
        })
      );
      expect(result).toEqual(mockFocusAreas);
    });

    it('should retrieve all focus areas with PROJECT type filter applied', async () => {
      const query = { type: PROJECT };
      const mockFocusAreas: any = [{ id: 2, name: 'Focus Area 2' }];
      jest.spyOn(prismaService.focusArea, 'findMany').mockResolvedValue(mockFocusAreas);

      const result = await service.findAll(query);

      expect(prismaService.focusArea.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.any(Object),
          orderBy: { createdAt: 'desc' },
        })
      );
      expect(result).toEqual(mockFocusAreas);
    });

    it('should call buildTeamFilter when TEAM type is specified', async () => {
      const query = { type: TEAM };
      jest.spyOn(teamsService, 'buildTeamFilter').mockReturnValue({} as any);
      await service.findAll(query);

      expect(teamsService.buildTeamFilter).toHaveBeenCalledWith(query);
    });

    it('should call buildProjectFilter when PROJECT type is specified', async () => {
      const query = { type: PROJECT };
      jest.spyOn(projectsService, 'buildProjectFilter').mockReturnValue({} as any);
      await service.findAll(query);

      expect(projectsService.buildProjectFilter).toHaveBeenCalledWith(query);
    });
  });
});
