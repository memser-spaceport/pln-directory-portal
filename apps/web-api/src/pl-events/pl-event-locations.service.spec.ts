import { Test, TestingModule } from '@nestjs/testing';
import { PLEventLocationsService } from './pl-event-locations.service';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import moment from 'moment-timezone';

describe('PLEventLocationsService', () => {
  let service: PLEventLocationsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    pLEventLocation: {
      findUniqueOrThrow: jest.fn(),
    },
  };

  const mockLogService = {
    error: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PLEventLocationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LogService, useValue: mockLogService },
      ],
    }).compile();

    service = module.get<PLEventLocationsService>(PLEventLocationsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  describe('getPLEventLocationByUid', () => {
    it('should retrieve event location by UID and return formatted location with events', async () => {
      const mockLocation = {
        uid: 'location-1',
        name: 'Test Location',
        timezone: 'America/New_York',
        events: [
          {
            slugURL: 'test-event-1',
            uid: 'event-1',
            name: 'Test Event 1',
            type: 'conference',
            startDate: '2024-10-25T10:00:00Z',
            endDate: '2024-10-25T12:00:00Z',
          },
          {
            slugURL: 'test-event-2',
            uid: 'event-2',
            name: 'Test Event 2',
            type: 'workshop',
            startDate: '2024-10-26T10:00:00Z',
            endDate: '2024-10-26T12:00:00Z',
          },
        ],
      };

      jest.spyOn(prismaService.pLEventLocation, 'findUniqueOrThrow').mockResolvedValue(mockLocation as any);

      const result = await service.getPLEventLocationByUid('location-1');

      expect(result).toBeDefined();
      expect(result.events).toHaveLength(2);
      expect(result.events[0].uid).toBe('event-1');
      expect(result.events[1].uid).toBe('event-2');
    });

    it('should throw NotFoundException when location is not found', async () => {
      const locationUid = 'invalid-uid';
      const error = new Prisma.PrismaClientKnownRequestError('Record not found', 'P2025', '1.0.0');

      jest.spyOn(prismaService.pLEventLocation, 'findUniqueOrThrow').mockRejectedValue(error);

      await expect(service.getPLEventLocationByUid(locationUid)).rejects.toThrow(
        new NotFoundException(`Pl Event location is not found with uid:${locationUid}`)
      );

      expect(mockLogService.error).toHaveBeenCalledWith(error);
    });
  });

  describe('getUpComingEventsByLocation', () => {
    it('should return past events when event location is found', async () => {
      const locationUid = 'test-location-uid';
      const events = {
        slugURL: 'event-2',
        uid: 'event-uid-2',
        name: 'Past Event 1',
        type: 'workshop',
        description: 'Description of Past Event 1',
        startDate: '2023-10-20T10:00:00Z',
        endDate: '2023-10-20T12:00:00Z',
        logo: 'logo-url',
        banner: 'banner-url',
        resources: 'resources',
        additionalInfo: 'info',
      };
      const mockFormattedLocation = {
        uid: locationUid,
        timezone: 'America/New_York',
        upcomingEvents: [events],
        pastEvents: [events],
      };

      jest.spyOn(service, 'getPLEventLocationByUid').mockResolvedValue(mockFormattedLocation as any);

      const result = await service.getPastEventsByLocation(locationUid);

      expect(service.getPLEventLocationByUid).toHaveBeenCalledWith(locationUid);
      expect(result).toEqual(mockFormattedLocation.upcomingEvents);
    });
  });
  describe('getPastEventsByLocation', () => {
    it('should return past events when event location is found', async () => {
      const locationUid = 'test-location-uid';
      const mockFormattedLocation = {
        uid: locationUid,
        timezone: 'America/New_York',
        upcomingEvents: [],
        pastEvents: [
          {
            slugURL: 'event-2',
            uid: 'event-uid-2',
            name: 'Past Event 1',
            type: 'workshop',
            description: 'Description of Past Event 1',
            startDate: '2023-10-20T10:00:00Z',
            endDate: '2023-10-20T12:00:00Z',
            logo: 'logo-url',
            banner: 'banner-url',
            resources: 'resources',
            additionalInfo: 'info',
          },
        ],
      };

      jest.spyOn(service, 'getPLEventLocationByUid').mockResolvedValue(mockFormattedLocation as any);

      const result = await service.getPastEventsByLocation(locationUid);

      expect(service.getPLEventLocationByUid).toHaveBeenCalledWith(locationUid);
      expect(result).toEqual(mockFormattedLocation.pastEvents);
    });

    it('should return undefined when no event location is found', async () => {
      const locationUid = 'invalid-location-uid';

      // Mock the service to return undefined (no location found)
      jest.spyOn(service, 'getPLEventLocationByUid').mockResolvedValue(undefined as any);

      const result = await service.getPastEventsByLocation(locationUid);

      expect(service.getPLEventLocationByUid).toHaveBeenCalledWith(locationUid);
      expect(result).toBeUndefined();
    });
  });

  describe('PLEventLocationsService - segregateEventsByTime', () => {
    const events: any = [
      {
        uid: 'event-1',
        startDate: '2024-10-23T10:00:00Z',
        endDate: '2024-10-23T12:00:00Z',
      },
      {
        uid: 'event-2',
        startDate: '2024-10-25T10:00:00Z',
        endDate: '2024-10-25T12:00:00Z',
      },
    ];
    it('should segregate events into past and upcoming correctly', () => {
      const timezone = 'America/New_York';
      const currentDate = moment.tz('2024-10-24T12:00:00', timezone);
      jest.spyOn(moment, 'tz').mockReturnValue(currentDate); // Mock current date

      const result = service['segregateEventsByTime'](events, timezone);

      expect(result.pastEvents).toHaveLength(1);
      expect(result.upcomingEvents).toHaveLength(1);

      // Verify the past event
      expect(result.pastEvents[0].uid).toBe('event-1');
      expect(result.pastEvents[0].startDate).toBe(moment.utc(events[0].startDate).tz(timezone).format());
      expect(result.pastEvents[0].endDate).toBe(moment.utc(events[0].endDate).tz(timezone).format());

      // Verify the upcoming event
      expect(result.upcomingEvents[0].uid).toBe('event-2');
      expect(result.upcomingEvents[0].startDate).toBe(moment.utc(events[1].startDate).tz(timezone).format());
      expect(result.upcomingEvents[0].endDate).toBe(moment.utc(events[1].endDate).tz(timezone).format());
    });

    it('should return all events as past if they have ended before current time', () => {
      const timezone = 'America/New_York';
      const currentDate = moment.tz('2024-10-24T12:00:00', timezone);
      jest.spyOn(moment, 'tz').mockReturnValue(currentDate); // Mock current date

      const result = service['segregateEventsByTime'](events, timezone);

      expect(result.pastEvents).toHaveLength(1);

      expect(result.upcomingEvents).toHaveLength(1);
    });

    it('should return all events as upcoming if they start after current time', () => {
      const timezone = 'America/New_York';
      const currentDate = moment.tz('2024-10-24T12:00:00', timezone);
      jest.spyOn(moment, 'tz').mockReturnValue(currentDate); // Mock current date

      const result = service['segregateEventsByTime'](events, timezone);

      expect(result.pastEvents).toHaveLength(1);
      expect(result.upcomingEvents).toHaveLength(1);
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
      expect(mockLogService.error).toHaveBeenCalledWith(mockError);
    });
    it('should throw non-Prisma error', () => {
      // Mock a general error (not a PrismaClientKnownRequestError)
      const mockError = new Error('Some general error');

      expect(() => service['handleErrors'](mockError)).toThrow(mockError); // Expecting the same error to be thrown

      // Verify logger.error was called with the error
      expect(mockLogService.error).toHaveBeenCalledWith(mockError);
    });
  });
});
