import { Test, TestingModule } from '@nestjs/testing';
import { HomeService } from './home.service';
import { MembersService } from '../members/members.service';
import { TeamsService } from '../teams/teams.service';
import { PLEventsService } from '../pl-events/pl-events.service';
import { ProjectsService } from '../projects/projects.service';
import { InternalServerErrorException } from '@nestjs/common';

describe('HomeService', () => {
  let homeService: HomeService;
  let membersService: MembersService;
  let teamsService: TeamsService;
  let plEventsService: PLEventsService;
  let projectsService: ProjectsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeService,
        {
          provide: MembersService,
          useValue: { findAll: jest.fn() },
        },
        {
          provide: TeamsService,
          useValue: { findAll: jest.fn() },
        },
        {
          provide: PLEventsService,
          useValue: { getPLEvents: jest.fn() },
        },
        {
          provide: ProjectsService,
          useValue: { getProjects: jest.fn() },
        },
      ],
    }).compile();

    homeService = module.get<HomeService>(HomeService);
    membersService = module.get<MembersService>(MembersService);
    teamsService = module.get<TeamsService>(TeamsService);
    plEventsService = module.get<PLEventsService>(PLEventsService);
    projectsService = module.get<ProjectsService>(ProjectsService);
  });

  it('should return featured data successfully', async () => {
    const mockMembers: any = [{ id: 1, name: 'Member1' }];
    const mockTeams: any = [{ id: 1, name: 'Team1' }];
    const mockEvents: any = [{ id: 1, name: 'Event1' }];
    const mockProjects: any = [{ id: 1, name: 'Project1' }];

    jest.spyOn(membersService, 'findAll').mockResolvedValue(mockMembers);
    jest.spyOn(teamsService, 'findAll').mockResolvedValue(mockTeams);
    jest.spyOn(plEventsService, 'getPLEvents').mockResolvedValue(mockEvents);
    jest.spyOn(projectsService, 'getProjects').mockResolvedValue(mockProjects);

    const result = await homeService.fetchAllFeaturedData();

    expect(result).toEqual({
      members: mockMembers,
      teams: mockTeams,
      events: mockEvents,
      projects: mockProjects,
    });
    expect(membersService.findAll).toHaveBeenCalledWith({
      where: { isFeatured: true },
      include: {
        image: true,
        location: true,
        skills: true,
        teamMemberRoles: {
          include: {
            team: {
              include: { logo: true },
            },
          },
        },
      },
    });
    expect(teamsService.findAll).toHaveBeenCalledWith({
      where: { isFeatured: true },
      include: { logo: true },
    });
    expect(plEventsService.getPLEvents).toHaveBeenCalledWith({
      where: { isFeatured: true },
    });
    expect(projectsService.getProjects).toHaveBeenCalledWith({
      where: { isFeatured: true },
    });
  });

  it('should throw InternalServerErrorException when an error occurs', async () => {
    jest.spyOn(membersService, 'findAll').mockRejectedValue(new Error('Database error'));

    await expect(homeService.fetchAllFeaturedData()).rejects.toThrow(InternalServerErrorException);
    await expect(homeService.fetchAllFeaturedData()).rejects.toThrow(
      'Error occured while retrieving featured data: Database error'
    );
  });
});
