import { Test, TestingModule } from '@nestjs/testing';
import { MemberFeedbacksService } from './member-feedbacks.service';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { MemberFollowUpsService } from '../member-follow-ups/member-follow-ups.service';
import { Prisma, MemberFollowUpStatus } from '@prisma/client';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('MemberFeedbacksService - createFeedback', () => {
  let service: MemberFeedbacksService;
  let prisma: PrismaService;
  let logger: LogService;
  let followUpService: MemberFollowUpsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberFeedbacksService,
        {
          provide: PrismaService,
          useValue: {
            memberFeedback: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: LogService,
          useValue: {
            error: jest.fn(),
          },
        },
        {
          provide: MemberFollowUpsService,
          useValue: {
            updateFollowUpStatusByUid: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<MemberFeedbacksService>(MemberFeedbacksService);
    prisma = module.get<PrismaService>(PrismaService);
    logger = module.get<LogService>(LogService);
    followUpService = module.get<MemberFollowUpsService>(MemberFollowUpsService);
  });

  const mockFeedback: Prisma.MemberFeedbackUncheckedCreateInput = {
    id: 1,
    uid: 'feedbackUid123',
    type: 'MEETING_FEEDBACK',
    data: { someJsonKey: 'someJsonValue' },
    rating: 5,
    comments: ['Great session!', 'Would love more interaction'],
    response: 'POSITIVE',
    followUpUid: 'followUpUid456',
    createdBy: 'userUid789',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockLoggedInMember = { uid: 'memberUid' };
  const mockFollowUp = { uid: 'followUpUid' };

  it('should create feedback and update follow-up status', async () => {
    jest.spyOn(prisma.memberFeedback, 'create').mockResolvedValue(mockFeedback as any);
    jest.spyOn(followUpService, 'updateFollowUpStatusByUid').mockResolvedValue({} as any);

    const result = await service.createFeedback(mockFeedback, mockLoggedInMember, mockFollowUp);

    expect(prisma.memberFeedback.create).toHaveBeenCalledWith({
      data: {
        ...mockFeedback,
        createdBy: mockLoggedInMember.uid,
        followUpUid: mockFollowUp.uid,
      },
    });
    expect(followUpService.updateFollowUpStatusByUid).toHaveBeenCalledWith(mockFollowUp.uid, 'COMPLETED', undefined);
    expect(result).toEqual(mockFeedback);
  });

  describe('show throw error', () => {
    it('should throw ConflictException for unique key constraint error (P2002)', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique key constraint error',
        'P2002',
        'prisma-client'
      );

      expect(() => service['handleErrors'](prismaError)).toThrow(ConflictException);
      expect(logger.error).toHaveBeenCalledWith(prismaError);
    });

    it('should throw BadRequestException for foreign key constraint error (P2003)', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint error',
        'P2003',
        'prisma-client'
      );

      expect(() => service['handleErrors'](prismaError)).toThrow(BadRequestException);
      expect(logger.error).toHaveBeenCalledWith(prismaError);
    });

    it('should throw NotFoundException for resource not found error (P2025)', () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Resource not found', 'P2025', 'prisma-client');

      expect(() => service['handleErrors'](prismaError, 'TestUid')).toThrow(NotFoundException);
      expect(logger.error).toHaveBeenCalledWith(prismaError);
    });

    it('should throw BadRequestException for validation error (PrismaClientValidationError)', () => {
      const prismaValidationError = new Prisma.PrismaClientValidationError('Validation error');

      expect(() => service['handleErrors'](prismaValidationError)).toThrow(BadRequestException);
      expect(logger.error).toHaveBeenCalledWith(prismaValidationError);
    });

    it('should rethrow unknown errors', () => {
      const unknownError = new Error('Unknown error');

      expect(() => service['handleErrors'](unknownError)).toThrow(Error);
      expect(logger.error).toHaveBeenCalledWith(unknownError);
    });
    it('should rethrow the error if not known Prisma error', () => {
      const error = new Error('Unknown error');

      expect(() => service['handleErrors'](error)).toThrow(Error);
      expect(logger.error).toHaveBeenCalledWith(error);
    });
  });
});
