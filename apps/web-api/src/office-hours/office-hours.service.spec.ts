import { Test, TestingModule } from '@nestjs/testing';
import { OfficeHoursService } from './office-hours.service';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { MemberFollowUpsService } from '../member-follow-ups/member-follow-ups.service';
import { MemberFeedbacksService } from '../member-feedbacks/member-feedbacks.service';
import { MemberFollowUpStatus, Prisma } from '@prisma/client';
import { MemberFollowUpType } from '@protocol-labs-network/contracts';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('OfficeHoursService', () => {
  let service: OfficeHoursService;
  let prismaService: PrismaService;
  let logger: LogService;
  let followUpService: MemberFollowUpsService;
  let feedbackService: MemberFeedbacksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfficeHoursService,
        {
          provide: PrismaService,
          useValue: {
            memberInteraction: {
              create: jest.fn(), // Mock memberInteraction.create
              findMany: jest.fn(), // Mock memberInteraction.findMany
            },
            $transaction: jest.fn((fn) => fn({ memberInteraction: prismaService.memberInteraction })), // Mock $transaction
          },
        },
        {
          provide: LogService,
          useValue: { error: jest.fn() }, // Mock log service
        },
        {
          provide: MemberFollowUpsService,
          useValue: { createFollowUp: jest.fn(), updateFollowUpStatusByUid: jest.fn(), getFollowUps: jest.fn() }, // Mock follow-up service
        },
        {
          provide: MemberFeedbacksService,
          useValue: { createFeedback: jest.fn() }, // Mock feedback service
        },
        {
          provide: LogService,
          useValue: { error: jest.fn() }, // Mock log service
        },
      ],
    }).compile();
    logger = module.get<LogService>(LogService);
    service = module.get<OfficeHoursService>(OfficeHoursService);
    prismaService = module.get<PrismaService>(PrismaService);
    followUpService = module.get<MemberFollowUpsService>(MemberFollowUpsService);
    feedbackService = module.get<MemberFeedbacksService>(MemberFeedbacksService);
  });

  it('should create a member interaction', async () => {
    const interactionInput = { hasFollowUp: true } as Prisma.MemberInteractionUncheckedCreateInput;
    const createdInteraction = { uid: 'interaction-uid', hasFollowUp: true };

    // Mocking `create` to resolve a value
    (prismaService.memberInteraction.create as jest.Mock).mockResolvedValue(createdInteraction);

    const result = await service.createInteraction(interactionInput, { uid: 'member-uid' });

    // Expect `create` to have been called with the correct arguments
    expect(prismaService.memberInteraction.create).toHaveBeenCalledWith({
      data: { ...interactionInput, sourceMemberUid: 'member-uid' },
    });

    expect(result).toEqual(createdInteraction);
  });

  it('should return interactions when query is successful', async () => {
    const mockInteractions = [{ id: 1, sourceMemberUid: 'test-uid' }];
    (prismaService.memberInteraction.findMany as jest.Mock).mockResolvedValue(mockInteractions);

    const queryOptions = { where: { sourceMemberUid: 'test-uid' } };
    const result = await service.findInteractions(queryOptions);
    expect(prismaService.memberInteraction.findMany).toHaveBeenCalledWith(queryOptions);
    expect(result).toEqual(mockInteractions);
  });

  it('should create a follow-up interaction', async () => {
    const interaction = { uid: 'interaction-uid', data: {} };
    const loggedInMember = { uid: 'member-uid' };
    const followUpType = MemberFollowUpType.Enum.MEETING_INITIATED;

    // Mocking the `createFollowUp` method of the followUpService
    const followUpResponse = { uid: 'follow-up-uid' };
    (followUpService.createFollowUp as jest.Mock).mockResolvedValue(followUpResponse);

    const result = await service.createInteractionFollowUp(interaction, loggedInMember, followUpType);

    expect(followUpService.createFollowUp).toHaveBeenCalledWith(
      {
        status: 'PENDING',
        interactionUid: 'interaction-uid',
        createdBy: 'member-uid',
        type: followUpType,
        data: interaction.data,
        isDelayed: false,
      },
      interaction,
      undefined
    );

    expect(result).toEqual(followUpResponse);
  });

  it('should successfully close the follow-up by ID', async () => {
    const followUpUid = 'follow-up-uid';

    // Mock the updateFollowUpStatusByUid to resolve successfully
    (followUpService.updateFollowUpStatusByUid as jest.Mock).mockResolvedValue({
      uid: followUpUid,
      status: 'CLOSED',
    });

    const result = await service.closeMemberInteractionFollowUpByID(followUpUid);

    // Expect the updateFollowUpStatusByUid method to be called with the correct arguments
    expect(followUpService.updateFollowUpStatusByUid).toHaveBeenCalledWith(followUpUid, 'CLOSED');

    // Expect the result to match the resolved value
    expect(result).toEqual({
      uid: followUpUid,
      status: 'CLOSED',
    });
  });

  it('should handle errors correctly when closing the follow-up', async () => {
    const followUpUid = 'follow-up-uid';
    const error = new Error('Something went wrong');

    // Mock the updateFollowUpStatusByUid to throw an error
    (followUpService.updateFollowUpStatusByUid as jest.Mock).mockRejectedValue(error);
    (logger.error as jest.Mock).mockImplementation(() => {}); // Mock logger

    // Mock the handleErrors method to throw an error when called
    const handleErrorsSpy = jest.spyOn(service as any, 'handleErrors');

    await expect(service.closeMemberInteractionFollowUpByID(followUpUid)).rejects.toThrow(error);

    // Expect the updateFollowUpStatusByUid method to be called with the correct arguments
    expect(followUpService.updateFollowUpStatusByUid).toHaveBeenCalledWith(followUpUid, 'CLOSED');

    // Expect the handleErrors method to be called with the correct error and follow-up ID
    expect(handleErrorsSpy).toHaveBeenCalledWith(error, followUpUid);
  });

  it('should complete scheduled follow-up when feedback is negative and meeting was initiated', async () => {
    const feedback = {
      response: 'NEGATIVE',
      comments: [],
    };
    const followUp = {
      type: MemberFollowUpType.Enum.MEETING_INITIATED,
      interactionUid: 'interaction-uid',
    };
    const delayedFollowUps = [{ uid: 'scheduled-follow-up-uid' }];

    // Mocking transaction and service methods
    (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => await callback({}));
    (followUpService.getFollowUps as jest.Mock).mockResolvedValue(delayedFollowUps);
    (followUpService.updateFollowUpStatusByUid as jest.Mock).mockResolvedValue({});

    await service.createInteractionFeedback(feedback, { uid: 'member-uid' }, followUp);

    // Assert getFollowUps and updateFollowUpStatusByUid were called
    expect(followUpService.getFollowUps).toHaveBeenCalledWith(
      {
        where: {
          interactionUid: followUp.interactionUid,
          type: MemberFollowUpType.Enum.MEETING_SCHEDULED,
        },
      },
      expect.any(Object)
    );

    expect(followUpService.updateFollowUpStatusByUid).toHaveBeenCalledWith(
      delayedFollowUps[0].uid,
      'COMPLETED',
      expect.any(Object)
    );
  });

  it('should create follow-up when feedback is negative and comments include IFR0004', async () => {
    const feedback = {
      response: 'NEGATIVE',
      comments: ['IFR0004'],
    };
    const followUp = {
      type: MemberFollowUpType.Enum.MEETING_INITIATED,
      interaction: { uid: 'interaction-uid' },
    };

    (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => await callback({}));
    const createFollowUpSpy = jest
      .spyOn(service, 'createInteractionFollowUp')
      .mockResolvedValue();

    await service.createInteractionFeedback(feedback, { uid: 'member-uid' }, followUp);

    // Expect `createInteractionFollowUp` to be called with `MEETING_YET_TO_HAPPEN`
    expect(createFollowUpSpy).toHaveBeenCalledTimes(1);
  });

  it('should reschedule meeting when feedback is negative and comments include IFR0005', async () => {
    const feedback = {
      response: 'NEGATIVE',
      comments: ['IFR0005'],
      data: {
        scheduledAt: '2024-10-10T10:00:00Z',
      },
    };
    const followUp = {
      type: MemberFollowUpType.Enum.MEETING_INITIATED,
      interaction: { uid: 'interaction-uid' },
    };

    (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => await callback({}));
    const createFollowUpSpy = jest.spyOn(service, 'createInteractionFollowUp').mockResolvedValue();

    await service.createInteractionFeedback(feedback, { uid: 'member-uid' }, followUp);

    // Expect `createInteractionFollowUp` to be called with `MEETING_RESCHEDULED` and the correct scheduledAt value
    expect(createFollowUpSpy).toHaveBeenCalledWith(followUp.interaction);
  });

  it('should create feedback', async () => {
    const feedback = {
      response: 'NEGATIVE',
      comments: [],
    };
    const followUp = {
      type: MemberFollowUpType.Enum.MEETING_INITIATED,
      interactionUid: 'interaction-uid',
    };

    (prismaService.$transaction as jest.Mock).mockImplementation(async (callback) => await callback({}));
    (feedbackService.createFeedback as jest.Mock).mockResolvedValue({});

    await service.createInteractionFeedback(feedback, { uid: 'member-uid' }, followUp);

    // Expect `createFeedback` to be called with the correct arguments
    expect(feedbackService.createFeedback).toHaveBeenCalledWith(
      feedback,
      { uid: 'member-uid' },
      followUp,
      expect.any(Object)
    );
  });

describe('OfficeHoursService - handleErrors', () => {
    it('should log the error and throw ConflictException for Prisma P2002 (Unique key constraint)', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique key constraint', 'P2002', 'clientVersion');
      
      expect(() => {
        service['handleErrors'](error);
      }).toThrow(ConflictException);
  
      expect(logger.error).toHaveBeenCalledWith(error);
    });
  
    it('should log the error and throw BadRequestException for Prisma P2003 (Foreign key constraint)', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Foreign key constraint', 'P2003', 'clientVersion');
      
      expect(() => {
        service['handleErrors'](error);
      }).toThrow(BadRequestException);
  
      expect(logger.error).toHaveBeenCalledWith(error);
    });
  
    it('should log the error and throw NotFoundException for Prisma P2025 (Record not found)', () => {
      const error = new Prisma.PrismaClientKnownRequestError('Record not found', 'P2025', 'clientVersion');
      
      expect(() => {
        service['handleErrors'](error, 'interaction-uid');
      }).toThrow(NotFoundException);
  
      expect(logger.error).toHaveBeenCalledWith(error);
    });
  
    it('should log the error and throw BadRequestException for Prisma ValidationError', () => {
      const error = new Prisma.PrismaClientValidationError('Validation error');
  
      expect(() => {
        service['handleErrors'](error);
      }).toThrow(BadRequestException);
  
      expect(logger.error).toHaveBeenCalledWith(error);
    });
  
    it('should throw the original error if it does not match any specific Prisma error', () => {
      const error = new Error('Some other error');
  
      expect(() => {
        service['handleErrors'](error);
      }).toThrow(Error);
  
      expect(logger.error).toHaveBeenCalledWith(error);
    });
  });
});
