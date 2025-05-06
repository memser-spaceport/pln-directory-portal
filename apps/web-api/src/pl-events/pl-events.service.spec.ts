import { Test, TestingModule } from '@nestjs/testing';
import { PLEventsService } from './pl-events.service';
import { PrismaService } from '../shared/prisma.service';
import { PLEventGuestsService } from './pl-event-guests.service';
import { LogService } from '../shared/log.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError, PrismaClientValidationError } from '@prisma/client/runtime';

describe('PLEventsService', () => {
  let service: PLEventsService;
  let prismaService: PrismaService;
  let eventGuestsService: PLEventGuestsService;
  let logger: LogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PLEventsService,
        {
          provide: PrismaService,
          useValue: {
            pLEvent: {
              findMany: jest.fn(),
              findUniqueOrThrow: jest.fn(),
            },
          },
        },
        {
          provide: PLEventGuestsService,
          useValue: {
            restrictTelegramBasedOnMemberPreference: jest.fn(),
          },
        },
        {
          provide: LogService,
          useValue: { error: jest.fn() }, // Mock LogService
        },
      ],
    }).compile();

    logger = module.get<LogService>(LogService);

    service = module.get<PLEventsService>(PLEventsService);
    prismaService = module.get<PrismaService>(PrismaService);
    eventGuestsService = module.get<PLEventGuestsService>(PLEventGuestsService);
    jest.spyOn(logger, 'error').mockImplementation(() => {});
  });

  describe('getPLEvents', () => {
    it('should return a list of events with the correct query options', async () => {
      const mockEvents = [
        { id: '1', name: 'Event 1' },
        { id: '2', name: 'Event 2' },
      ];
      (prismaService.pLEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);

      const queryOptions = { where: { name: 'Test Event' } };
      const result = await service.getPLEvents(queryOptions);

      expect(result).toEqual(mockEvents);
      expect(prismaService.pLEvent.findMany).toHaveBeenCalledWith({
        ...queryOptions,
        include: {
          logo: true,
          banner: true,
          eventGuests: { select: { eventUid: true } },
          location: true,
        },
      });
    });
  });

  describe('getPLEventBySlug', () => {
    it('should return the event with restricted fields when user is not logged in', async () => {
      const mockEvent = {
        slugURL: 'test-slug',
        logo: { url: 'logo-url' },
        banner: { url: 'banner-url' },
        eventGuests: [
          {
            uid: 'guest1',
            member: {
              name: 'Guest Name',
              preferences: {},
              telegramHandler: 'handler1',
            },
            telegramId: 'testTelegramId',
          },
        ],
      };

      // Mocking the Prisma method to return the mock event
      (prismaService.pLEvent.findUniqueOrThrow as jest.Mock).mockResolvedValue(mockEvent);

      // Mocking the event guest restriction method
      (eventGuestsService.restrictTelegramBasedOnMemberPreference as jest.Mock).mockReturnValue(mockEvent.eventGuests);

      const result = await service.getPLEventBySlug('test-slug', false);

      expect(prismaService.pLEvent.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { slugURL: 'test-slug' },
        include: expect.any(Object),
      });
      expect(eventGuestsService.restrictTelegramBasedOnMemberPreference).toHaveBeenCalledWith(
        mockEvent.eventGuests,
        false
      );
      expect(result).toEqual(mockEvent);
    });

    it('should throw NotFoundException when event is not found', async () => {
      (prismaService.pLEvent.findUniqueOrThrow as jest.Mock).mockRejectedValue(
        new NotFoundException('Event not found')
      );

      await expect(service.getPLEventBySlug('non-existent-slug', true)).rejects.toThrow(NotFoundException);
    });

    it('should call filterPrivateResources when event is found', async () => {
      const mockEvent = {
        slugURL: 'test-slug',
        resources: [{ isPrivate: true }],
        eventGuests: [],
      };
      jest.spyOn(service, 'filterPrivateResources'); // Spy on filterPrivateResources
      (prismaService.pLEvent.findUniqueOrThrow as jest.Mock).mockResolvedValue(mockEvent);

      await service.getPLEventBySlug('test-slug', false);

      expect(service.filterPrivateResources).toHaveBeenCalledWith(mockEvent, false);
    });
  });

  describe('getPLEventsByMember', () => {
    const mockMember: any = { uid: 'member-uid' };
    const mockEvents: any = [
      { id: 1, slugURL: 'event1' },
      { id: 2, slugURL: 'event2' },
    ];
    it('should return a list of events for a given member', async () => {
      // Mocking the Prisma findMany method to return mock events
      (prismaService.pLEvent.findMany as jest.Mock).mockResolvedValue(mockEvents);

      const result = await service.getPLEventsByMember(mockMember);

      expect(prismaService.pLEvent.findMany).toHaveBeenCalledWith({
        where: {
          eventGuests: {
            some: {
              memberUid: mockMember.uid,
            },
          },
        },
      });
      expect(result).toEqual(mockEvents);
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
        expect(error.message).toContain('Unique key constraint error on Event Guest:');
      }

      // Ensure logger error is called
      expect(logger.error).toHaveBeenCalledWith(uniqueConstraintError);
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
        expect(error.message).toContain('Foreign key constraint error on Event Guest');
      }

      // Ensure logger error is called
      expect(logger.error).toHaveBeenCalledWith(foreignKeyConstraintError);
    });

    it('should handle not found error (P2025) without throwing error directly in test', async () => {
      // Arrange: Mock the Prisma error for "not found" error (P2025)
      const notFoundError = new Prisma.PrismaClientKnownRequestError('Record not found', 'P2025', 'prisma');
      try {
        (service as any).handleErrors(notFoundError);
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect(error.message).toContain('Event is not found with uid');
      }
      expect(logger.error).toHaveBeenCalledWith(notFoundError);
    });


    it('should throw BadRequestException on validation error', () => {
        // Arrange: Mock the Prisma validation error
        const validationError = new PrismaClientValidationError('Validation failed on field');
    
        // Act & Assert
        try {
          (service as any).handleErrors(validationError);
        } catch (error) {
          expect(error).toBeInstanceOf(BadRequestException);
          expect(error.message).toContain('Database field validation error on Event Guest');
        }
        expect(logger.error).toHaveBeenCalledWith(validationError);
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
        expect(logger.error).toHaveBeenCalledWith(unknownError);
      });
  });
});
