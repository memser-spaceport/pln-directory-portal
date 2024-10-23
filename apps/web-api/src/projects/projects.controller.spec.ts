import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ResponseProjectWithRelationsSchema } from 'libs/contracts/src/schema';
import { ZodValidationPipe } from 'nestjs-zod';
import { NotFoundException } from '@nestjs/common';

describe('ProjectsController - findAll - builtQuery.where branch coverage', () => {
  let controller: ProjectsController;
  let mockProjectsService: Partial<ProjectsService>;

  beforeEach(async () => {
    mockProjectsService = {
      getProjects: jest.fn(),
      buildFocusAreaFilters: jest.fn().mockReturnValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: mockProjectsService }],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('should handle case where builtQuery.where is undefined', async () => {
    const req = { query: { focusAreas: '' } };
    const mockBuilder = {
      build: jest.fn().mockReturnValue({ where: undefined }), // Simulate undefined where condition
    };
    jest.spyOn(PrismaQueryBuilder.prototype, 'build').mockReturnValue(mockBuilder.build(req.query));

    await controller.findAll(req);

    expect(mockProjectsService.getProjects).toHaveBeenCalledWith({
      where: {
        AND: [{}, {}], // First {} is the undefined where clause, second is the focus area filter
      },
    });
  });

  it('should handle case where builtQuery.where is defined', async () => {
    const req = { query: { focusAreas: '' } };
    const mockBuilder = {
      build: jest.fn().mockReturnValue({ where: { name: { contains: 'test' } } }), // Simulate defined where condition
    };
    jest.spyOn(PrismaQueryBuilder.prototype, 'build').mockReturnValue(mockBuilder.build(req.query));

    await controller.findAll(req);

    expect(mockProjectsService.getProjects).toHaveBeenCalledWith({
      where: {
        AND: [{ name: { contains: 'test' } }, {}], // First condition is from where clause, second is focus area filter
      },
    });
  });
  describe('findOne', () => {
    const uid = 'test-uid';

    it('should return a project when found', async () => {
      // Arrange: Mock the service to return a project
      const mockProject = { uid, name: 'Test Project' };
      (mockProjectsService.getProjectByUid as jest.Mock).mockResolvedValueOnce(mockProject);

      // Act: Call the findOne method
      const result = await controller.findOne({ params: { uid } } as any);

      // Assert: Check if the result is the mock project
      expect(result).toEqual(mockProject);
      expect(mockProjectsService.getProjectByUid).toHaveBeenCalledWith(uid);
    });

    it('should throw NotFoundException when project is not found', async () => {
      // Arrange: Mock the mockProjectsService to return undefined (project not found)
      (mockProjectsService.getProjectByUid as jest.Mock).mockResolvedValueOnce(undefined);

      // Act and Assert: Expect a NotFoundException to be thrown
      await expect(controller.findOne({ params: { uid } } as any)).rejects.toThrow(
        new NotFoundException(`Project not found with uid: ${uid}.`)
      );

      // Ensure that the mockProjectsService was called with the correct parameter
      expect(mockProjectsService.getProjectByUid).toHaveBeenCalledWith(uid);
    });
  });
});
