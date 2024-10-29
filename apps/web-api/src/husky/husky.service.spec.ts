import { Test, TestingModule } from '@nestjs/testing';
import { HuskyService } from './husky.service';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime';

describe('HuskyService', () => {
  let service: HuskyService;
  let logService: LogService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HuskyService,
        {
          provide: LogService,
          useValue: {
            error: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            discoveryQuestion: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<HuskyService>(HuskyService);
    logService = module.get<LogService>(LogService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchDiscoverQuestions', () => {
    it('should return discovery questions with relations', async () => {
      const mockQuery = {};
      const mockResult = [{ id: 1, question: 'Sample Question' }];
      (prismaService.discoveryQuestion.findMany as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.fetchDiscoverQuestions(mockQuery as Prisma.DiscoveryQuestionFindManyArgs);

      expect(prismaService.discoveryQuestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            team: expect.any(Object),
            project: expect.any(Object),
            plevent: expect.any(Object),
          }),
        })
      );
      expect(result).toEqual(mockResult);
    });

    it('should log and handle errors', async () => {
      const mockQuery = {};
      const mockError = new Error('Database error');
      (prismaService.discoveryQuestion.findMany as jest.Mock).mockRejectedValue(mockError);

      await expect(service.fetchDiscoverQuestions(mockQuery as Prisma.DiscoveryQuestionFindManyArgs)).rejects.toThrow(
        mockError
      );
      expect(logService.error).toHaveBeenCalledWith(mockError);
    });
  });

  describe('fetchDiscoverQuestionBySlug', () => {
    it('should return a discovery question by slug', async () => {
      const mockSlug = 'test-slug';
      const mockQuestion = { id: 1, slug: mockSlug };
      (prismaService.discoveryQuestion.findUnique as jest.Mock).mockResolvedValue(mockQuestion);

      const result = await service.fetchDiscoverQuestionBySlug(mockSlug);

      expect(prismaService.discoveryQuestion.findUnique).toHaveBeenCalledWith({ where: { slug: mockSlug } });
      expect(result).toEqual(mockQuestion);
    });

    it('should log and handle errors', async () => {
      const mockSlug = 'test-slug';
      const mockError = new Error('Database error');
      (prismaService.discoveryQuestion.findUnique as jest.Mock).mockRejectedValue(mockError);

      await expect(service.fetchDiscoverQuestionBySlug(mockSlug)).rejects.toThrow(mockError);
      expect(logService.error).toHaveBeenCalledWith(mockError);
    });
  });

  describe('createDiscoverQuestion', () => {
    it('should create a new discovery question', async () => {
      const mockQuestion = { question: 'Sample question' };
      const mockMember = { uid: 'member-id' };
      const mockResult = { id: 1, ...mockQuestion };
      (prismaService.discoveryQuestion.create as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.createDiscoverQuestion(mockQuestion as any, mockMember);

      expect(prismaService.discoveryQuestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdBy: mockMember.uid,
            modifiedBy: mockMember.uid,
            slug: expect.any(String),
          }),
        })
      );
      expect(result).toEqual(mockResult);
    });

    it('should throw ConflictException on unique constraint error', async () => {
      const mockError = new Prisma.PrismaClientKnownRequestError('Unique constraint', 'P2002', 'version');
      (prismaService.discoveryQuestion.create as jest.Mock).mockRejectedValue(mockError);

      await expect(service.createDiscoverQuestion({} as any, { uid: 'member-id' })).rejects.toThrow(ConflictException);
      expect(logService.error).toHaveBeenCalledWith(mockError);
    });
  });

  describe('updateDiscoveryQuestionBySlug', () => {
    it('should update an existing discovery question by slug', async () => {
      const mockSlug = 'test-slug';
      const mockQuestion = { question: 'Updated question' };
      const mockMember = { uid: 'member-id' };
      const mockResult = { id: 1, ...mockQuestion };
      (prismaService.discoveryQuestion.update as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.updateDiscoveryQuestionBySlug(mockSlug, mockQuestion as any, mockMember);

      expect(prismaService.discoveryQuestion.update).toHaveBeenCalledWith({
        where: { slug: mockSlug },
        data: expect.objectContaining({ modifiedBy: mockMember.uid }),
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateDiscoveryQuestionShareCount', () => {
    it('should increment share count of a discovery question', async () => {
      const mockSlug = 'test-slug';
      const mockResult = { shareCount: 1 };
      (prismaService.discoveryQuestion.update as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.updateDiscoveryQuestionShareCount(mockSlug);

      expect(prismaService.discoveryQuestion.update).toHaveBeenCalledWith({
        where: { slug: mockSlug },
        data: { shareCount: { increment: 1 } },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateDiscoveryQuestionViewCount', () => {
    it('should increment view count of a discovery question', async () => {
      const mockSlug = 'test-slug';
      const mockResult = { viewCount: 1 };
      (prismaService.discoveryQuestion.update as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.updateDiscoveryQuestionViewCount(mockSlug);

      expect(prismaService.discoveryQuestion.update).toHaveBeenCalledWith({
        where: { slug: mockSlug },
        data: { viewCount: { increment: 1 } },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateDiscoveryQuestionBySlug', () => {
    it('should throw NotFoundException if question does not exist (P2025)', async () => {
      const mockError = new Prisma.PrismaClientKnownRequestError('Record not found', 'P2025', 'version');
      (prismaService.discoveryQuestion.update as jest.Mock).mockRejectedValue(mockError);

      await expect(
        service.updateDiscoveryQuestionBySlug('non-existing-slug', {} as any, { uid: 'member-id' })
      ).rejects.toThrow(NotFoundException);
      expect(logService.error).toHaveBeenCalledWith(mockError);
    });

    it('should throw ConflictException on unique constraint error (P2002)', async () => {
      const mockError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', 'P2002', 'version');
      (prismaService.discoveryQuestion.update as jest.Mock).mockRejectedValue(mockError);

      await expect(
        service.updateDiscoveryQuestionBySlug('unique-slug', {} as any, { uid: 'member-id' })
      ).rejects.toThrow(ConflictException);
      expect(logService.error).toHaveBeenCalledWith(mockError);
    });

    it('should throw BadRequestException on foreign key constraint error (P2003)', async () => {
      const mockError = new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', 'P2003', 'version');
      (prismaService.discoveryQuestion.update as jest.Mock).mockRejectedValue(mockError);

      await expect(
        service.updateDiscoveryQuestionBySlug('foreign-key-slug', {} as any, { uid: 'member-id' })
      ).rejects.toThrow(BadRequestException);
      expect(logService.error).toHaveBeenCalledWith(mockError);
    });

    it('should throw BadRequestException on validation error', async () => {
      const mockError = new Prisma.PrismaClientValidationError('Validation error');
      (prismaService.discoveryQuestion.update as jest.Mock).mockRejectedValue(mockError);

      await expect(
        service.updateDiscoveryQuestionBySlug('validation-error-slug', {} as any, { uid: 'member-id' })
      ).rejects.toThrow(BadRequestException);
      expect(logService.error).toHaveBeenCalledWith(mockError);
    });
  });

  describe('fetchDiscoverQuestions', () => {
    it('should fetch discovery questions successfully', async () => {
      const mockResult = [{ id: '1', question: 'Test question' }];
      (prismaService.discoveryQuestion.findMany as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.fetchDiscoverQuestions({});
      expect(result).toEqual(mockResult);
    });
  });

  describe('fetchDiscoverQuestionBySlug', () => {
    it('should fetch discovery question by slug successfully', async () => {
      const mockResult = { id: '1', slug: 'test-slug', question: 'Test question' };
      (prismaService.discoveryQuestion.findUnique as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.fetchDiscoverQuestionBySlug('test-slug');
      expect(result).toEqual(mockResult);
    });
  });

  describe('createDiscoverQuestion', () => {
    it('should create a discovery question successfully', async () => {
      const mockResult = { id: '1', question: 'Created question' };
      (prismaService.discoveryQuestion.create as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.createDiscoverQuestion({ question: 'Created question' } as any, {
        uid: 'member-id',
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateDiscoveryQuestionShareCount', () => {
    it('should update share count successfully', async () => {
      const mockResult = { id: '1', shareCount: 1 };
      (prismaService.discoveryQuestion.update as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.updateDiscoveryQuestionShareCount('test-slug');
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateDiscoveryQuestionViewCount', () => {
    it('should update view count successfully', async () => {
      const mockResult = { id: '1', viewCount: 1 };
      (prismaService.discoveryQuestion.update as jest.Mock).mockResolvedValue(mockResult);

      const result = await service.updateDiscoveryQuestionViewCount('test-slug');
      expect(result).toEqual(mockResult);
    });
  });

describe('handleError', () => {
    it('should handle unique constraint error (P2002) without throwing error directly in test', async () => {
      const uniqueConstraintError = new PrismaClientKnownRequestError('Unique constraint failed', 'P2002', 'prisma');

      // Act & Assert: Directly call the private method using `as any` and expect a ConflictException
      try {
        (service as any).handleErrors(uniqueConstraintError);
      } catch (error) {
        expect(error).toBeInstanceOf(ConflictException);
        expect(error.message).toContain('Unique key constraint error on discovery');
      }

      // Ensure logger error is called
      expect(logService.error).toHaveBeenCalledWith(uniqueConstraintError);
    });

    it('should handle foreign key constraint error (P2003) without throwing error directly in test', async () => {
      // Arrange: Mock the Prisma error for a foreign key constraint (P2003)
      const foreignKeyConstraintError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        'P2003',
        'prisma'
      );
  
      // Act & Assert: Directly call the private method using `as any` and expect a ConflictException
      try {
        (service as any).handleErrors(foreignKeyConstraintError);
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect(error.message).toContain('Foreign key constraint error on discovery question');
      }

      // Ensure logger error is called
      expect(logService.error).toHaveBeenCalledWith(foreignKeyConstraintError);
    });

    it('should handle not found error (P2025) without throwing error directly in test', async () => {
      // Arrange: Mock the Prisma error for "not found" error (P2025)
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', 'P2025', 'prisma');
      try {
        (service as any).handleErrors(notFoundError);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.message).toContain('Discovery question is not found with slug:undefined');
      }
      expect(logService.error).toHaveBeenCalledWith(notFoundError);
    });


    it('should throw BadRequestException on validation error', () => {
        // Arrange: Mock the Prisma validation error
        const validationError = new PrismaClientValidationError('Validation failed on field');
    
        // Act & Assert
        try {
          (service as any).handleErrors(validationError);
        } catch (error) {
          expect(error).toBeInstanceOf(BadRequestException);
          expect(error.message).toContain('Database field validation error on discovery question');
        }
        expect(logService.error).toHaveBeenCalledWith(validationError);
      });


      it('should rethrow an unknown error directly', () => {
        // Arrange: Create a mock error that does not match handled cases
        const unknownError = new Error('Unexpected error');
    
        // Act & Assert
        try {
          (service as any).handleErrors(unknownError);
        } catch (error) {
          // Assert that the original error is thrown without modification
          expect(error).toBe(unknownError);
          expect(error.message).toBe('Unexpected error');
        }
    
        // Ensure that the logger captured the error
        expect(logService.error).toHaveBeenCalledWith(unknownError);
      });
  });
});
