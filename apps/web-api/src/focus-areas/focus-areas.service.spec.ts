import { PrismaService } from '../shared/prisma.service';
import { TeamsService } from '../teams/teams.service';
import { ProjectsService } from '../projects/projects.service';
import { FocusAreasService } from './focus-areas.service';

jest.mock('../teams/teams.service', () => ({ TeamsService: class TeamsService {} }));
jest.mock('../projects/projects.service', () => ({ ProjectsService: class ProjectsService {} }));

describe('FocusAreasService', () => {
  let service: FocusAreasService;

  const focusAreaFindMany = jest.fn();
  const prismaMock = { focusArea: { findMany: focusAreaFindMany } } as unknown as PrismaService;
  const projectFilter = { AND: [{ isDeleted: false }, { lookingForFunding: true }] };
  const projectsServiceMock = {
    buildProjectFilter: jest.fn().mockReturnValue(projectFilter),
  } as unknown as ProjectsService;
  const teamsServiceMock = {} as TeamsService;

  const project = (uid: string) => ({ project: { uid, name: `Project ${uid}`, logo: null } });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FocusAreasService(prismaMock, teamsServiceMock, projectsServiceMock);
  });

  it('adds projectCount to every focus area and every nested child for type=Project', async () => {
    focusAreaFindMany.mockResolvedValue([
      {
        uid: 'fa-data',
        title: 'Data',
        description: null,
        parentUid: null,
        projectAncestorFocusAreas: [project('p1'), project('p2'), project('p3')],
        children: [
          {
            uid: 'fa-storage',
            title: 'Storage',
            description: null,
            parentUid: 'fa-data',
            projectAncestorFocusAreas: [project('p2'), project('p3')],
            children: [
              {
                uid: 'fa-archive',
                title: 'Archive',
                description: null,
                parentUid: 'fa-storage',
                projectAncestorFocusAreas: [project('p3')],
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    const result: any[] = await service.findAll({ type: 'Project' });

    expect(result[0].projectCount).toBe(3);
    expect(result[0].children[0].projectCount).toBe(2);
    expect(result[0].children[0].children[0].projectCount).toBe(1);
  });

  it('counts the distinct ancestor rows, so a parent includes the projects of its children once each', async () => {
    focusAreaFindMany.mockResolvedValue([]);

    await service.findAll({ type: 'Project' });

    const select = focusAreaFindMany.mock.calls[0][0].select;
    expect(select.projectAncestorFocusAreas.distinct).toBe('projectUid');
    expect(select.children.select.projectAncestorFocusAreas.distinct).toBe('projectUid');
  });

  it('uses the project filter (deleted projects excluded, query filters applied) for the counted list', async () => {
    focusAreaFindMany.mockResolvedValue([]);
    const query = { type: 'Project', lookingForFunding: 'true', team: 'team-1', tags: 'ai', isRecent: 'true' };

    await service.findAll(query);

    expect(projectsServiceMock.buildProjectFilter).toHaveBeenCalledWith(query);
    const select = focusAreaFindMany.mock.calls[0][0].select;
    expect(select.projectAncestorFocusAreas.where).toEqual({ project: projectFilter });
    expect(select.children.select.projectAncestorFocusAreas.where).toEqual({ project: projectFilter });
  });

  it('returns projectCount 0 for a focus area with no projects and keeps the existing fields', async () => {
    const emptyArea = {
      uid: 'fa-empty',
      title: 'Empty',
      description: 'No projects',
      parentUid: null,
      projectAncestorFocusAreas: [],
      children: [],
    };
    focusAreaFindMany.mockResolvedValue([emptyArea]);

    const result: any[] = await service.findAll({ type: 'Project' });

    expect(result[0]).toEqual({ ...emptyArea, projectCount: 0 });
  });

  it('does not add projectCount for other types', async () => {
    const teamArea = { uid: 'fa-1', title: 'Data', teamAncestorFocusAreas: [], children: [] };
    focusAreaFindMany.mockResolvedValue([teamArea]);

    const result: any[] = await service.findAll({ type: 'Team' });

    expect(result[0]).toEqual(teamArea);
    expect(result[0]).not.toHaveProperty('projectCount');
  });
});
