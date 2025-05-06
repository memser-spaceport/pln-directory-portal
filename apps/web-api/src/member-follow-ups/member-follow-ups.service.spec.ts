import { Test, TestingModule } from '@nestjs/testing';
import { MemberFollowUpsService } from './member-follow-ups.service';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { Prisma } from '@prisma/client';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

describe('MemberFollowUpsService', () => {
  let service: MemberFollowUpsService;
  let prismaService: PrismaService;
  let logService: LogService;

  const mockPrismaService = {
    memberFollowUp: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockLogService = {
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberFollowUpsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LogService, useValue: mockLogService },
      ],
    }).compile();

    service = module.get<MemberFollowUpsService>(MemberFollowUpsService);
    prismaService = module.get<PrismaService>(PrismaService);
    logService = module.get<LogService>(LogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createFollowUp', () => {
    it('should create a follow up successfully', async () => {
        const followUpData: Prisma.MemberFollowUpUncheckedCreateInput = {
          uid: 'unique-followup-id',
          status: 'PENDING', // Adjust this based on your MemberFollowUpStatus enum values
          type: 'EMAIL',
          data: { key: 'value' }, // Adjust based on your nullable JSON structure
          isDelayed: false,
          interactionUid: null,
          createdBy: 'creator-id',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
    
        mockPrismaService.memberFollowUp.create.mockResolvedValue(followUpData);
    
        const result = await service.createFollowUp(followUpData, null);
        expect(result).toEqual(followUpData);
        expect(mockPrismaService.memberFollowUp.create).toHaveBeenCalledWith({
          data: followUpData,
        });
      });


      it('should call handleErrors on createFollowUp error', async () => {
        const followUpData: Prisma.MemberFollowUpUncheckedCreateInput = {
          uid: 'unique-followup-id',
          status: 'PENDING',
          type: 'EMAIL',
          data: { key: 'value' },
          isDelayed: false,
          interactionUid: null,
          createdBy: 'creator-id',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
    
        const error = new Prisma.PrismaClientKnownRequestError(
          'Unique key constraint error on follow ups',
          'P2002',
          'client-version'
        );
    
        mockPrismaService.memberFollowUp.create.mockRejectedValue(error);
    
        await expect(service.createFollowUp(followUpData, null)).rejects.toThrow(ConflictException);
        expect(mockLogService.error).toHaveBeenCalledWith(error);
      });
  });

  describe('getFollowUps', () => {
    it('should return follow ups successfully', async () => {
      const query = { /* your query here */ };
      const followUps = [{ /* your follow up data here */ }];
      const followUpData: Prisma.MemberFollowUpUncheckedCreateInput = {
        uid: 'unique-followup-id',
        status: 'PENDING', // Adjust this based on your MemberFollowUpStatus enum values
        type: 'EMAIL',
        data: { key: 'value' }, // Adjust based on your nullable JSON structure
        isDelayed: false,
        interactionUid: null,
        createdBy: 'creator-id',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrismaService.memberFollowUp.findMany.mockResolvedValue(followUpData);

      const result = await service.getFollowUps(query);
      expect(result).toEqual(followUps);
      expect(mockPrismaService.memberFollowUp.findMany).toHaveBeenCalledWith({
        ...query,
        include: expect.any(Object),
      });
    });

    it('should call handleErrors on getFollowUps error', async () => {
        const error = new Prisma.PrismaClientKnownRequestError(
          'Foreign key constraint error on follow ups',
          'P2003',
          'client-version'
        );
    
        mockPrismaService.memberFollowUp.findMany.mockRejectedValue(error);
    
        await expect(service.getFollowUps({}, null as any)).rejects.toThrow(BadRequestException);
        expect(mockLogService.error).toHaveBeenCalledWith(error);
      });
  });

  describe('updateFollowUpStatusByUid', () => {
    it('should update the follow up status successfully', async () => {
      const uid = 'some-uid';
      const status = 'new-status';
      const updatedFollowUp = { uid, status };
      mockPrismaService.memberFollowUp.update.mockResolvedValue(updatedFollowUp);

      const result = await service.updateFollowUpStatusByUid(uid, status);
      expect(result).toEqual(updatedFollowUp);
      expect(mockPrismaService.memberFollowUp.update).toHaveBeenCalledWith({
        where: { uid },
        data: { status },
      });
    });

    it('should call handleErrors on updateFollowUpStatusByUid error', async () => {
        const uid = 'some-uid';
        const status = 'COMPLETED';
        const error = new Prisma.PrismaClientKnownRequestError(
          'Follow up not found',
          'P2025',
          'client-version'
        );
    
        mockPrismaService.memberFollowUp.update.mockRejectedValue(error);
    
        await expect(service.updateFollowUpStatusByUid(uid, status, null as any)).rejects.toThrow(NotFoundException);
        expect(mockLogService.error).toHaveBeenCalledWith(error);
      });
  });



  it('should build the correct query for the default days', () => {
    // Set default behavior (assuming default is 7 days)
    process.env.INTERACTION_FOLLOWUP_DELAY_IN_DAYS = '7';
    const expectedDate = new Date();
    expectedDate.setDate(expectedDate.getDate() - 7); // Calculate the date of 7 days ago

    const query = service.buildDelayedFollowUpQuery();

    expect(query).toEqual({
      OR: [
        {
          isDelayed: false,
          createdAt: {
            lte: new Date(),
          },
        },
        {
          isDelayed: true,
          createdAt: {
            lte: expectedDate,
          },
        },
      ],
    });
  });


  it('should throw a ConflictException for unique key constraint error (P2002)', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Unique key constraint error on follow ups',
      'P2002',
      'client-version' // Specify client version
    );

    expect(() => service['handleErrors'](error)).toThrow(ConflictException);
    expect(() => service['handleErrors'](error)).toThrow('Unique key constraint error on follow ups:');
    expect(logService.error).toHaveBeenCalledWith(error);
  });

  it('should throw a BadRequestException for foreign key constraint error (P2003)', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Foreign key constraint error on follow ups',
      'P2003',
      'client-version'
    );

    expect(() => service['handleErrors'](error)).toThrow(BadRequestException);
    expect(() => service['handleErrors'](error)).toThrow('Foreign key constraint error on follow ups');
    expect(logService.error).toHaveBeenCalledWith(error);
  });

  it('should throw a NotFoundException for not found error (P2025)', () => {
    const error = new Prisma.PrismaClientKnownRequestError(
      'Follow up not found',
      'P2025',
      'client-version'
    );

    expect(() => service['handleErrors'](error, 'some-uid')).toThrow(NotFoundException);
    expect(() => service['handleErrors'](error, 'some-uid')).toThrow('Follow up is not found with uid:some-uid');
    expect(logService.error).toHaveBeenCalledWith(error);
  });

  it('should throw a BadRequestException for validation error', () => {
    const error = new Prisma.PrismaClientValidationError('Validation error');

    expect(() => service['handleErrors'](error)).toThrow(BadRequestException);
    expect(() => service['handleErrors'](error)).toThrow('Database field validation error on follow ups');
    expect(logService.error).toHaveBeenCalledWith(error);
  });

  it('should throw the original error for unhandled cases', () => {
    const error = new Error('Some other error');

    expect(() => service['handleErrors'](error)).toThrow(error);
    expect(logService.error).toHaveBeenCalledWith(error);
  });
});
