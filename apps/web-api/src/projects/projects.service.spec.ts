import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsService } from './projects.service';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { MembersService } from '../members/members.service';
import { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import {
  BadRequestException,
  CACHE_MANAGER,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

describe('ProjectsService', () => {
  let service: ProjectsService;

  const mockProjectUpdate = jest.fn();
  const mockProjectFindUnique = jest.fn();
  const mockTransaction = jest.fn();

  const mockProjectCreate = jest.fn();
  const mockPrismaService = {
    project: {
      create: mockProjectCreate,
      update: mockProjectUpdate,
      findUniqueOrThrow: mockProjectFindUnique,
    },
    $transaction: jest.fn((callback) => {
      return callback(mockTransaction);
    }),
    focusAreaHierarchy: { findMany: jest.fn() },
    projectFocusArea: { findMany: jest.fn(), deleteMany: jest.fn() },
  };

  const mockMembersService = {
    findMemberByEmail: jest.fn().mockResolvedValue({ uid: 'user-uid-789' }),
    isMemberPartOfTeams: jest.fn().mockResolvedValue(true),
    isMemberLeadTeam: jest.fn(),
    checkIfAdminUser: jest.fn(),
    isMemberAllowedToEdit: jest.fn(),
  };
  const mockCacheService = {
    reset: jest.fn(),
  };

  const mockLoggerService = {
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: MembersService, useValue: mockMembersService },
        { provide: CACHE_MANAGER, useValue: mockCacheService },
        { provide: LogService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  describe('createProject', () => {
    it('should connect contributing teams correctly', async () => {
      const projectInput = {
        name: 'New Project',
        tagline: 'Project Tagline',
        description: 'Project Description',
        contributingTeams: [{ uid: 'team-uid-1' }, { uid: 'team-uid-2' }],
        contributions: [
          {
            uid: 'uid-1',
          },
        ],
        createdBy: 'user-uid-789',
        maintainingTeamUid: 'maintaining-team-uid',
      };

      mockProjectCreate.mockResolvedValue(projectInput);

      const result = await service.createProject(projectInput as any, 'user@example.com');

      expect(mockProjectCreate).toHaveBeenCalledWith({
        data: expect.objectContaining(projectInput),
      });

      expect(result).toEqual({ uid: 'project-uid' });
      expect(mockCacheService.reset).toHaveBeenCalled();
    });
  });

  describe('updateProjectByUid', () => {
    it('should create contributions when uid is not present', async () => {
      const uid = 'project-uid';
      const userEmail = 'user@example.com';
      const contributions = [
        { title: 'Contribution 1' }, // No uid, should be added to contributionsToCreate
        { uid: 'contribution-1', isDeleted: true }, // Should be added to contributionsToDelete
        { uid: 'contribution-2', isDeleted: false }, // Should not be added
      ];

      // Mocking the member and project retrieval methods
      jest.spyOn(service, 'getMemberInfo').mockResolvedValue('email-1@mail.com' as any);
      jest.spyOn(service, 'getProjectByUid').mockResolvedValue('uid' as any);
      jest.spyOn(service, 'isMemberAllowedToEdit').mockResolvedValue(true);

      await service.updateProjectByUid(uid, { contributions } as any, userEmail);

      expect(mockPrismaService.project.update).toHaveBeenCalledWith({
        where: { uid },
        data: {
          contributions: {
            create: [{ title: 'Contribution 1' }], // Contribution to create
            deleteMany: [{ uid: 'contribution-1' }], // Contribution to delete
          },
        },
      });
    });

    it('should handle contributions correctly when none are marked for deletion', async () => {
      const uid = 'project-uid';
      const userEmail = 'user@example.com';
      const contributions = [
        { title: 'Contribution 1' }, // No uid, should be added to contributionsToCreate
        { uid: 'contribution-2', isDeleted: false }, // Should not be added to contributionsToDelete
      ];

      const getProjectByUid: any = {
        maintainingTeamUid: 'team-uid',
        contributingTeams: [{ uid: 'team-uid' }],
      };
      // Mocking the member and project retrieval methods
      jest.spyOn(service, 'getMemberInfo').mockResolvedValue({ uid: 'member-uid' } as any);
      jest.spyOn(service, 'getProjectByUid').mockResolvedValue(getProjectByUid);
      jest.spyOn(service, 'isMemberAllowedToEdit').mockResolvedValue(true);

      await service.updateProjectByUid(uid, { contributions } as any, userEmail);

      expect(mockPrismaService.project.update).toHaveBeenCalledWith({
        where: { uid },
        data: {
          contributions: {
            create: [{ title: 'Contribution 1' }], // Contribution to create
            deleteMany: [], // No contributions to delete
          },
        },
      });
    });
    it('should handle contributions correctly: create and delete', async () => {
      const uid = 'project-uid';
      const projectInput = {
        contributions: [
          { description: 'New Contribution' },
          { uid: 'existing-contribution-uid', isDeleted: true },
          { uid: 'existing-contribution-uid-2' },
        ],
      };

      const existingData = {
        uid: 'project-uid',
        maintainingTeamUid: 'maintaining-team-uid',
        contributingTeams: [{ uid: 'team-uid-1' }],
      };

      mockProjectFindUnique.mockResolvedValue(existingData);
      mockProjectUpdate.mockResolvedValue({ uid });

      const result = await service.updateProjectByUid(uid, projectInput as any, 'user@example.com');

      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockProjectUpdate).toHaveBeenCalledWith({
        where: { uid },
        data: {
          contributions: {
            create: [{ description: 'New Contribution' }],
            deleteMany: [{ uid: 'existing-contribution-uid' }],
          },
        },
      });

      expect(result).toEqual({ uid });
      expect(mockCacheService.reset).toHaveBeenCalled();
    });

    it('should handle no contributions case', async () => {
      const uid = 'project-uid';
      const projectInput = {
        contributions: [],
      };

      const existingData = {
        uid: 'project-uid',
        maintainingTeamUid: 'maintaining-team-uid',
        contributingTeams: [{ uid: 'team-uid-1' }],
      };

      mockProjectFindUnique.mockResolvedValue(existingData);
      mockProjectUpdate.mockResolvedValue({ uid });

      const result = await service.updateProjectByUid(uid, projectInput as any, 'user@example.com');

      expect(mockProjectUpdate).toHaveBeenCalledWith({
        where: { uid },
        data: {
          contributions: {
            create: [],
            deleteMany: [],
          },
        },
      });

      expect(result).toEqual({ uid });
      expect(mockCacheService.reset).toHaveBeenCalled();
    });

    it('should throw an error if project is not found', async () => {
      const uid = 'non-existing-project-uid';
      const projectInput = {
        /* add necessary fields */
      };

      mockProjectFindUnique.mockRejectedValue(new Error('Project not found'));

      await expect(service.updateProjectByUid(uid, projectInput, 'user@example.com')).rejects.toThrow(
        'Project not found'
      );

      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });

  describe('removeProjectByUid', () => {
    it('should mark the project as deleted and return the result', async () => {
      const uid = 'project-uid';
      const userEmail = 'test@example.com';
      const updateResult = { uid, isDeleted: true };

      (mockPrismaService.project.update as jest.Mock).mockResolvedValue(updateResult); // Mocking the Prisma update call

      const result = await service.removeProjectByUid(uid, userEmail);

      expect(mockPrismaService.project.update).toHaveBeenCalledWith({
        where: { uid },
        data: { isDeleted: true },
      });
      expect(result).toEqual(updateResult);
    });
  });

  describe('createProjectWithFocusAreas', () => {
    it('should return createMany data when focusAreas are provided', async () => {
      const focusAreas = [{ uid: 'focusArea1' }, { uid: 'focusArea2' }];

      const focusAreaHierarchies = [
        { subFocusAreaUid: 'focusArea1', focusAreaUid: 'ancestor1' },
        { subFocusAreaUid: 'focusArea2', focusAreaUid: 'ancestor2' },
      ];

      (mockPrismaService.focusAreaHierarchy.findMany as jest.Mock).mockResolvedValue(focusAreaHierarchies);

      const result = await service.createProjectWithFocusAreas(focusAreas, mockPrismaService);

      expect(result).toEqual({
        createMany: {
          data: [
            { focusAreaUid: 'focusArea1', ancestorAreaUid: 'ancestor1' },
            { focusAreaUid: 'focusArea2', ancestorAreaUid: 'ancestor2' },
            { focusAreaUid: 'focusArea1', ancestorAreaUid: 'focusArea1' },
            { focusAreaUid: 'focusArea2', ancestorAreaUid: 'focusArea2' },
          ],
        },
      });
      expect(mockPrismaService.focusAreaHierarchy.findMany).toHaveBeenCalledWith({
        where: {
          subFocusAreaUid: {
            in: ['focusArea1', 'focusArea2'],
          },
        },
      });
    });

    it('should return undefined when focusAreas are empty', async () => {
      const result = await service.createProjectWithFocusAreas([], mockPrismaService);
      expect(result).toBeUndefined();
    });

    it('should return undefined when focusAreas are not provided', async () => {
      const result = await service.createProjectWithFocusAreas(null, mockPrismaService);
      expect(result).toBeUndefined();
    });

    it('should handle error when findMany fails', async () => {
      const focusAreas = [{ uid: 'focusArea1' }];
      const error = new Error('Database error');

      (mockPrismaService.focusAreaHierarchy.findMany as jest.Mock).mockRejectedValue(error);

      await expect(service.createProjectWithFocusAreas(focusAreas, mockPrismaService)).rejects.toThrow(error);
    });
  });

  describe('isFocusAreaModified', () => {
    it('should return true when the number of focus areas is different', async () => {
      const projectId = 'project1';
      const focusAreas = [{ uid: 'focusArea1' }, { uid: 'focusArea2' }];
      const projectFocusAreas = [{ focusAreaUid: 'focusArea1' }]; // Existing focus areas in DB

      (mockPrismaService.projectFocusArea.findMany as jest.Mock).mockResolvedValue(projectFocusAreas);

      const result = await service.isFocusAreaModified(projectId, focusAreas, mockPrismaService);
      expect(result).toBe(true);
    });

    it('should return false when both focus areas are empty', async () => {
      const projectId = 'project1';
      const focusAreas = [];
      const projectFocusAreas = []; // Existing focus areas in DB

      (mockPrismaService.projectFocusArea.findMany as jest.Mock).mockResolvedValue(projectFocusAreas);

      const result = await service.isFocusAreaModified(projectId, focusAreas, mockPrismaService);
      expect(result).toBe(false);
    });

    it('should return false when focus areas have not changed', async () => {
      const projectId = 'project1';
      const focusAreas = [{ uid: 'focusArea1' }, { uid: 'focusArea2' }];
      const projectFocusAreas = [{ focusAreaUid: 'focusArea1' }, { focusAreaUid: 'focusArea2' }]; // Existing focus areas in DB

      (mockPrismaService.projectFocusArea.findMany as jest.Mock).mockResolvedValue(projectFocusAreas);

      const result = await service.isFocusAreaModified(projectId, focusAreas, mockPrismaService);
      expect(result).toBe(false);
    });

    it('should return true when some focus areas have changed', async () => {
      const projectId = 'project1';
      const focusAreas = [{ uid: 'focusArea1' }, { uid: 'focusArea3' }];
      const projectFocusAreas = [{ focusAreaUid: 'focusArea1' }, { focusAreaUid: 'focusArea2' }]; // Existing focus areas in DB

      (mockPrismaService.projectFocusArea.findMany as jest.Mock).mockResolvedValue(projectFocusAreas);

      const result = await service.isFocusAreaModified(projectId, focusAreas, mockPrismaService);
      expect(result).toBe(true);
    });

    it('should return true when focus areas are completely new', async () => {
      const projectId = 'project1';
      const focusAreas = [{ uid: 'focusArea3' }];
      const projectFocusAreas = [{ focusAreaUid: 'focusArea1' }, { focusAreaUid: 'focusArea2' }]; // Existing focus areas in DB

      (mockPrismaService.projectFocusArea.findMany as jest.Mock).mockResolvedValue(projectFocusAreas);

      const result = await service.isFocusAreaModified(projectId, focusAreas, mockPrismaService);
      expect(result).toBe(true);
    });
  });

  describe('updateProjectWithFocusAreas', () => {
    it('should delete existing focus areas and create new ones when modified', async () => {
      const projectId = 'project1';
      const focusAreas = [{ uid: 'focusArea1' }, { uid: 'focusArea2' }];

      // Mocking the isFocusAreaModified method
      jest.spyOn(service, 'isFocusAreaModified').mockResolvedValue(true);
      jest.spyOn(service, 'createProjectWithFocusAreas').mockResolvedValue({ createMany: { data: focusAreas } });

      const transaction = { projectFocusArea: mockPrismaService.projectFocusArea }; // Mock transaction

      await service.updateProjectWithFocusAreas(projectId, focusAreas, transaction);

      expect(transaction.projectFocusArea.deleteMany).toHaveBeenCalledWith({ where: { projectUid: projectId } });
      expect(service.createProjectWithFocusAreas).toHaveBeenCalledWith(focusAreas, transaction);
    });

    it('should delete existing focus areas when focus areas are empty', async () => {
      const projectId = 'project1';
      const focusAreas = [];

      jest.spyOn(service, 'isFocusAreaModified').mockResolvedValue(true);
      const transaction = { projectFocusArea: mockPrismaService.projectFocusArea }; // Mock transaction

      await service.updateProjectWithFocusAreas(projectId, focusAreas, transaction);

      expect(transaction.projectFocusArea.deleteMany).toHaveBeenCalledWith({ where: { projectUid: projectId } });
      expect(service.createProjectWithFocusAreas).not.toHaveBeenCalled();
    });

    it('should not delete or create focus areas if not modified', async () => {
      const projectId = 'project1';
      const focusAreas = [{ uid: 'focusArea1' }];

      jest.spyOn(service, 'isFocusAreaModified').mockResolvedValue(false);
      const transaction = { projectFocusArea: mockPrismaService.projectFocusArea }; // Mock transaction

      const result = await service.updateProjectWithFocusAreas(projectId, focusAreas, transaction);

      expect(transaction.projectFocusArea.deleteMany).not.toHaveBeenCalled();
      expect(service.createProjectWithFocusAreas).not.toHaveBeenCalled();
      expect(result).toEqual({});
    });
  });

  describe('buildFocusAreaFilters', () => {
    it('should return filter object when focusAreas are provided', () => {
      const focusAreas = 'Tech,Health';
      const result = service.buildFocusAreaFilters(focusAreas);
      const projectFocusAreas = {
        some: {
          ancestorArea: {
            title: {
              in: ['Tech', 'Health'],
            },
          },
        },
      };
      expect(result).toEqual({
        projectFocusAreas,
      });
    });

    it('should return empty filter object when focusAreas is undefined', () => {
      const result = service.buildFocusAreaFilters(undefined);

      expect(result).toEqual({});
    });
  });

  describe('removeDuplicateFocusAreas', () => {
    it('should remove duplicate focus areas based on uid', () => {
      const focusAreas = [
        { focusArea: { uid: '1', title: 'Focus Area 1' } },
        { focusArea: { uid: '2', title: 'Focus Area 2' } },
      ];

      const result = service.removeDuplicateFocusAreas(focusAreas);

      expect(result).toEqual([
        { uid: '1', title: 'Focus Area 1' },
        { uid: '2', title: 'Focus Area 2' },
      ]);
    });

    it('should return an empty array if no focus areas are provided', () => {
      const focusAreas = [];
      const result = service.removeDuplicateFocusAreas(focusAreas);
      expect(result).toEqual([]);
    });

    it('should return the same array if no duplicates are found', () => {
      const focusAreas = [
        { focusArea: { uid: '1', title: 'Focus Area 1' } },
        { focusArea: { uid: '2', title: 'Focus Area 2' } },
      ];

      const result = service.removeDuplicateFocusAreas(focusAreas);

      expect(result).toEqual([
        { uid: '1', title: 'Focus Area 1' },
        { uid: '2', title: 'Focus Area 2' },
      ]);
    });
  });

  describe('buildProjectFilter', () => {
    it('should return filter with default isDeleted filter', () => {
      const query = {};
      const result = service.buildProjectFilter(query);

      expect(result).toEqual({
        AND: [{ isDeleted: false }],
      });
    });

    it('should build name filter when name is provided', () => {
      const query = { name: 'test' };
      const result = service.buildProjectFilter(query);

      expect(result).toEqual({
        AND: [{ isDeleted: false }, { name: { contains: 'test', mode: 'insensitive' } }],
      });
    });

    it('should build funding filter when lookingForFunding is "true"', () => {
      const query = { lookingForFunding: 'true' };
      const result = service.buildProjectFilter(query);

      expect(result).toEqual({
        AND: [{ isDeleted: false }, { lookingForFunding: true }],
      });
    });

    it('should build maintaining team filter when team is provided', () => {
      const query = { team: 'team-uid' };
      const result = service.buildProjectFilter(query);

      expect(result).toEqual({
        AND: [{ isDeleted: false }, { maintainingTeamUid: 'team-uid' }],
      });
    });

    it('should combine all filters when all query parameters are provided', () => {
      const query = { name: 'test', lookingForFunding: 'true', team: 'team-uid' };
      const result = service.buildProjectFilter(query);

      expect(result).toEqual({
        AND: [
          { isDeleted: false },
          { name: { contains: 'test', mode: 'insensitive' } },
          { lookingForFunding: true },
          { maintainingTeamUid: 'team-uid' },
        ],
      });
    });
  });

  describe(' isMemberAllowedToDelete', () => {
    it('should allow deletion if member is an admin', async () => {
      const mockMember = { uid: 'member-uid' };
      const mockProject = { maintainingTeamUid: 'team-uid', createdBy: 'other-member-uid', uid: 'project-uid' };

      // Mocking the responses
      mockMembersService.isMemberLeadTeam.mockResolvedValue(false); // Member is not a lead
      mockMembersService.checkIfAdminUser.mockReturnValue(true); // Member is an admin

      const result = await service.isMemberAllowedToDelete(mockMember, mockProject);

      expect(result).toBe(true);
      expect(mockMembersService.isMemberLeadTeam).toHaveBeenCalledWith(mockMember, 'team-uid');
      expect(mockMembersService.checkIfAdminUser).toHaveBeenCalledWith(mockMember);
    });

    it('should throw ForbiddenException if member is not creator, leader, or admin', async () => {
      const mockMember = { uid: 'member-uid' };
      const mockProject = { maintainingTeamUid: 'team-uid', createdBy: 'other-member-uid', uid: 'project-uid' };

      // Mocking the responses
      mockMembersService.isMemberLeadTeam.mockResolvedValue(false); // Not a lead
      mockMembersService.checkIfAdminUser.mockReturnValue(false); // Not an admin

      await expect(service.isMemberAllowedToDelete(mockMember, mockProject)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('handleErrors', () => {
    it('should throw unhandled Prisma error (default case)', () => {
      // Mock a different PrismaClientKnownRequestError that does not match any case
      const mockError = new Prisma.PrismaClientKnownRequestError(
        'Some unknown error',
        'P1234', // An arbitrary code that's not handled
        '4.0.0'
      );

      expect(() => service['handleErrors'](mockError)).toThrow(mockError); // Expecting the same error to be thrown

      // Verify logger.error was called with the error
      expect(mockLoggerService.error).toHaveBeenCalledWith(mockError);
    });
    it('should throw non-Prisma error', () => {
      // Mock a general error (not a PrismaClientKnownRequestError)
      const mockError = new Error('Some general error');

      expect(() => service['handleErrors'](mockError)).toThrow(mockError); // Expecting the same error to be thrown

      // Verify logger.error was called with the error
      expect(mockLoggerService.error).toHaveBeenCalledWith(mockError);
    });
  });
  it('should log and throw a ConflictException for P2002 error code', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique key constraint error', 'P2002', '2.30.0');

    expect(() => service['handleErrors'](error)).toThrow(ConflictException);
    expect(mockLoggerService.error).toHaveBeenCalledWith(error);
  });

  it('should log and throw a BadRequestException for P2003 error code', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Foreign key constraint error', 'P2003', '2.30.0');

    expect(() => service['handleErrors'](error)).toThrow(BadRequestException);
    expect(mockLoggerService.error).toHaveBeenCalledWith(error);
  });

  it('should log and throw a NotFoundException for P2025 error code', () => {
    const error = new Prisma.PrismaClientKnownRequestError('Project not found', 'P2025', '2.30.0');
    const message = 'project-uid';

    expect(() => service['handleErrors'](error, message)).toThrow(NotFoundException);
    expect(mockLoggerService.error).toHaveBeenCalledWith(error);
  });

  it('should log and throw a BadRequestException for PrismaClientValidationError', () => {
    const error = new Prisma.PrismaClientValidationError('Validation error');

    expect(() => service['handleErrors'](error)).toThrow(BadRequestException);
    expect(mockLoggerService.error).toHaveBeenCalledWith(error);
  });

  it('should log and rethrow unknown errors', () => {
    const error = new Error('Unknown error');

    expect(() => service['handleErrors'](error)).toThrow(Error);
    expect(mockLoggerService.error).toHaveBeenCalledWith(error);
  });
});
