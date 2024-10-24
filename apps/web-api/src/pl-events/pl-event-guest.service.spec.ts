import { Test, TestingModule } from '@nestjs/testing';
import { PLEventGuestsService } from './pl-event-guests.service';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { MembersService } from '../members/members.service';
import { PLEventLocationsService } from './pl-event-locations.service';
import { BadRequestException, CACHE_MANAGER, ConflictException, NotFoundException } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';

describe('PLEventGuestsService', () => {
  let service: PLEventGuestsService;
  let prismaService: PrismaService;
  let cacheService: Cache;
  let membersService: MembersService;
  let loggerService: LogService;
  let eventLocationsService: PLEventLocationsService;

  const mockLoggerService = {
    error: jest.fn(),
  };
  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PLEventGuestsService,
        PrismaService,
        PLEventLocationsService,
        {
          provide: CACHE_MANAGER,
          useValue: {
            reset: jest.fn(), // Mock the reset method
          },
        },
        {
          provide: MembersService,
          useValue: {
            checkIfAdminUser: jest.fn(),
            findOne: jest.fn(),
            updateTelegramIfChanged: jest.fn(),
            updateOfficeHoursIfChanged: jest.fn(),
          },
        },
        {
          provide: LogService,
          useValue: mockLoggerService
        },
      ],
    }).compile();

    service = module.get<PLEventGuestsService>(PLEventGuestsService);
    prismaService = module.get<PrismaService>(PrismaService);
    cacheService = module.get<Cache>(CACHE_MANAGER);
    membersService = module.get<MembersService>(MembersService);
    eventLocationsService = module.get<PLEventLocationsService>(PLEventLocationsService);
  });

  const mockData = {
    teamUid: 'team123',
    memberUid: 'member123',
    telegramId: 'userTelegram123',
    reason: 'Attending for networking opportunities',
    additionalInfo: {
      foodPreferences: 'Vegetarian',
      arrivalTime: '10:00 AM',
    },
    topics: ['Tech Innovation', 'AI Trends'],
    officeHours: '9:00 AM - 5:00 PM',
    events: [
      {
        uid: 'event1',
        isHost: true,
        isSpeaker: false,
        hostSubEvents: [
          {
            name: 'Opening Ceremony',
            link: 'https://example.com/opening-ceremony',
          },
        ],
        speakerSubEvents: [],
      },
      {
        uid: 'event2',
        isHost: false,
        isSpeaker: true,
        hostSubEvents: [],
        speakerSubEvents: [
          {
            name: 'Keynote on AI',
            link: 'https://example.com/keynote-ai',
          },
        ],
      },
    ],
  };

  const mockMember = {
    id: 1,
    uid: 'user123',
    name: 'test user',
    email: 'test.user@example.com',
    imageUid: 'image123',
    githubHandler: 'testuser',
    discordHandler: 'testuser#1234',
    twitterHandler: 'testuser',
    linkedinHandler: 'testuser-profile',
    telegramHandler: 'testuserTelegram',
    officeHours: '10:00 AM - 6:00 PM',
    moreDetails: 'Experienced software developer',
    bio: 'A passionate developer with a focus on web technologies.',
    plnFriend: true,
    plnStartDate: new Date(),
    airtableRecId: 'rec123',
    externalId: 'ext456',
    openToWork: true,
    isFeatured: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    approvedAt: new Date(),
    locationUid: 'location789',
    preferences: {
      showTelegram: true,
      theme: 'dark',
    },
  };

  const mockLocation: any = {
    upcomingEvents: [],
    pastEvents: [],
  };

  const mockLocationUid: any = 'location123';
  const mockEvents: any = [
    { uid: 'event1', name: 'Event 1' },
    { uid: 'event2', name: 'Event 2' },
  ];

  const mockGuests: any = [
    {
      uid: 'guest1',
      reason: 'Networking',
      memberUid: 'member1',
      event: {
        uid: 'event1',
        name: 'Event 1',
        slugURL: '/event1',
        type: 'upcoming',
        description: 'Description of event 1',
        startDate: new Date(),
        endDate: new Date(),
        logo: { url: 'logo1.png' },
        banner: { url: 'banner1.png' },
        additionalInfo: 'Some additional info',
      },
      member: {
        name: 'Member 1',
        image: { url: 'member1.png' },
        telegramHandler: '@member1',
        officeHours: '9:00 AM - 5:00 PM',
        teamMemberRoles: [],
        projectContributions: [],
        createdProjects: [],
      },
      createdAt: new Date(),
      telegramId: '@member1Telegram',
      officeHours: '9:00 AM - 5:00 PM',
    },
  ];

  const mockMembersAndEvents = [
    {
      memberUid: 'member1',
      events: ['event1', 'event2'],
    },
    {
      memberUid: 'member2',
      events: ['event3'],
    },
  ];

  describe('createPLEventGuestByLocation', () => {
    it('should create event guests and reset cache with admin role', async () => {
      const prismaCreateManyMock = jest.spyOn(prismaService.pLEventGuest, 'createMany').mockResolvedValue({ count: 2 });
      jest.spyOn(membersService, 'checkIfAdminUser').mockReturnValue(false);
      const updateMemberDetailsMock = jest.spyOn(service, 'updateMemberDetails').mockResolvedValue(undefined);
      const formatInputToEventGuestsMock = jest.spyOn(service as any, 'formatInputToEventGuests').mockReturnValue([
        {
          memberUid: 'current-member-uid',
          eventUid: 'event1',
          telegramId: 'test-telegram-id',
          officeHours: '10:00 AM - 6:00 PM',
          additionalInfo: {},
          topics: ['topic1', 'topic2'],
          isHost: false,
          isSpeaker: false,
        },
        {
          memberUid: 'current-member-uid',
          eventUid: 'event2',
          telegramId: 'test-telegram-id',
          officeHours: '10:00 AM - 6:00 PM',
          additionalInfo: {},
          topics: ['topic1', 'topic2'],
          isHost: true,
          isSpeaker: false,
        },
      ]);

      // Execute the method
      const result = await service.createPLEventGuestByLocation(mockData, mockMember);

      // Assert that the methods are called with correct arguments
      expect(updateMemberDetailsMock).toHaveBeenCalledWith(
        mockData,
        mockMember,
        false, // isAdmin check
        undefined // no transaction client passed
      );

      expect(formatInputToEventGuestsMock).toHaveBeenCalledWith(mockData);

      expect(prismaCreateManyMock).toHaveBeenCalledWith({
        data: [
          {
            memberUid: 'current-member-uid',
            eventUid: 'event1',
            telegramId: 'test-telegram-id',
            officeHours: '10:00 AM - 6:00 PM',
            additionalInfo: {},
            topics: ['topic1', 'topic2'],
            isHost: false,
            isSpeaker: false,
          },
          {
            memberUid: 'current-member-uid',
            eventUid: 'event2',
            telegramId: 'test-telegram-id',
            officeHours: '10:00 AM - 6:00 PM',
            additionalInfo: {},
            topics: ['topic1', 'topic2'],
            isHost: true,
            isSpeaker: false,
          },
        ],
      });

      // Assert that cache reset was called
      expect(cacheService.reset).toHaveBeenCalled();

      // Assert the result
      expect(result).toEqual({ count: 2 });
    });

    it('should create event guests and reset cache without admin role', async () => {
      const prismaCreateManyMock = jest.spyOn(prismaService.pLEventGuest, 'createMany').mockResolvedValue({ count: 2 });
      jest.spyOn(membersService, 'checkIfAdminUser').mockReturnValue(true);
      const updateMemberDetailsMock = jest.spyOn(service, 'updateMemberDetails').mockResolvedValue(undefined);
      const formatInputToEventGuestsMock = jest.spyOn(service as any, 'formatInputToEventGuests').mockReturnValue([
        {
          memberUid: 'current-member-uid',
          eventUid: 'event1',
          telegramId: 'test-telegram-id',
          officeHours: '10:00 AM - 6:00 PM',
          additionalInfo: {},
          topics: ['topic1', 'topic2'],
          isHost: false,
          isSpeaker: false,
        },
        {
          memberUid: 'current-member-uid',
          eventUid: 'event2',
          telegramId: 'test-telegram-id',
          officeHours: '10:00 AM - 6:00 PM',
          additionalInfo: {},
          topics: ['topic1', 'topic2'],
          isHost: true,
          isSpeaker: false,
        },
      ]);

      // Execute the method
      const result = await service.createPLEventGuestByLocation(mockData, mockMember);

      // Assert that the methods are called with correct arguments
      expect(updateMemberDetailsMock).toHaveBeenCalledWith(
        mockData,
        mockMember,
        false, // isAdmin check
        undefined // no transaction client passed
      );

      expect(formatInputToEventGuestsMock).toHaveBeenCalledWith(mockData);

      expect(prismaCreateManyMock).toHaveBeenCalledWith({
        data: [
          {
            memberUid: 'current-member-uid',
            eventUid: 'event1',
            telegramId: 'test-telegram-id',
            officeHours: '10:00 AM - 6:00 PM',
            additionalInfo: {},
            topics: ['topic1', 'topic2'],
            isHost: false,
            isSpeaker: false,
          },
          {
            memberUid: 'current-member-uid',
            eventUid: 'event2',
            telegramId: 'test-telegram-id',
            officeHours: '10:00 AM - 6:00 PM',
            additionalInfo: {},
            topics: ['topic1', 'topic2'],
            isHost: true,
            isSpeaker: false,
          },
        ],
      });

      // Assert that cache reset was called
      expect(cacheService.reset).toHaveBeenCalled();

      // Assert the result
      expect(result).toEqual({ count: 2 });
    });

    it('should handle errors and call handleErrors', async () => {
      const error = new Error('Prisma error');
      jest.spyOn(eventLocationsService, 'getUpcomingEventsByLocation').mockRejectedValue(error);
      const handleErrorsMock = jest.spyOn(service as any, 'handleErrors');

      await expect(service.getPLEventGuestsByLocationAndType(mockLocationUid, 'upcoming', true)).rejects.toThrowError(
        'Prisma error'
      );
      expect(handleErrorsMock).toHaveBeenCalledWith(error);
    });
    it('should handle errors and call handleErrors', async () => {
      const error = new Error('Some error occurred');
      jest.spyOn(prismaService.pLEventGuest, 'deleteMany').mockRejectedValue(error);
      const handleErrorsMock = jest.spyOn(service as any, 'handleErrors');

      await expect(service.deletePLEventGuests(mockMembersAndEvents)).rejects.toThrowError('Some error occurred');

      // Assert that handleErrors was called
      expect(handleErrorsMock).toHaveBeenCalledWith(error);
    });
  });

  describe('modifyPLEventGuestByLocation with admin role', () => {
    it('should modify event guests for upcoming events and reset cache', async () => {
      // Arrange: Simulate non-admin user
      jest.spyOn(membersService, 'checkIfAdminUser').mockReturnValue(false);

      const prismaDeleteManyMock = jest.spyOn(prismaService.pLEventGuest, 'deleteMany').mockResolvedValue({ count: 2 });
      const createPLEventGuestByLocationMock = jest
        .spyOn(service, 'createPLEventGuestByLocation')
        .mockResolvedValue({ count: 2 });

      // Act
      const result = await service.modifyPLEventGuestByLocation(mockData, mockLocation, mockMember, 'upcoming');

      // Assert: Ensure the correct events are used and deletion happens for the right member
      expect(prismaDeleteManyMock).toHaveBeenCalledWith({
        where: {
          memberUid: 'user123', // Non-admin user
          eventUid: { in: ['event1', 'event2'] }, // Upcoming events
        },
      });

      // Ensure createPLEventGuestByLocation is called within the transaction
      expect(createPLEventGuestByLocationMock).toHaveBeenCalledWith(mockData, mockMember, expect.anything());

      expect(result).toEqual({ count: 2 });
    });

    it('should modify event guests for past events when type is past and member is admin', async () => {
      // Arrange: Simulate admin user
      jest.spyOn(membersService, 'checkIfAdminUser').mockReturnValue(true);

      const prismaDeleteManyMock = jest.spyOn(prismaService.pLEventGuest, 'deleteMany').mockResolvedValue({ count: 2 });
      const createPLEventGuestByLocationMock = jest
        .spyOn(service, 'createPLEventGuestByLocation')
        .mockResolvedValue({ count: 2 });

      // Act
      const result = await service.modifyPLEventGuestByLocation(mockData, mockLocation, mockMember, 'past');

      // Assert: Ensure the correct events are used and deletion happens for the right member
      expect(prismaDeleteManyMock).toHaveBeenCalledWith({
        where: {
          memberUid: 'member123', // Admin user, use data.memberUid
          eventUid: { in: ['event3', 'event4'] }, // Past events
        },
      });

      // Ensure createPLEventGuestByLocation is called within the transaction
      expect(createPLEventGuestByLocationMock).toHaveBeenCalledWith(mockData, mockMember, expect.anything());

      expect(result).toEqual({ count: 2 });
    });

    it('should handle errors during modification', async () => {
      // Arrange: Simulate an error thrown by Prisma
      const error = new Error('Some Prisma error');
      jest.spyOn(prismaService.pLEventGuest, 'deleteMany').mockRejectedValue(error);
      const handleErrorsMock = jest.spyOn(service as any, 'handleErrors');

      // Act & Assert: Ensure the error is handled
      await expect(
        service.modifyPLEventGuestByLocation(mockData, mockLocation, mockMember, 'upcoming')
      ).rejects.toThrowError('Some Prisma error');

      expect(handleErrorsMock).toHaveBeenCalledWith(error);
    });
  });

  describe('getPLEventGuestsByLocationAndType', () => {
    it('should get upcoming event guests and return correct result for logged-in user', async () => {
      // Mocking services and Prisma
      jest.spyOn(eventLocationsService, 'getUpcomingEventsByLocation').mockResolvedValue(mockEvents);
      jest.spyOn(prismaService.pLEventGuest, 'findMany').mockResolvedValue(mockGuests);

      const result = await service.getPLEventGuestsByLocationAndType(mockLocationUid, 'upcoming', true);

      // Check if the services are called with correct arguments
      expect(eventLocationsService.getUpcomingEventsByLocation).toHaveBeenCalledWith(mockLocationUid);
      expect(prismaService.pLEventGuest.findMany).toHaveBeenCalledWith({
        where: {
          eventUid: { in: ['event1', 'event2'] },
        },
        select: expect.anything(), // Ensure the right select fields are passed
      });

      // Check if result matches the mock guest data
      expect(result).toEqual(mockGuests);
    });

    it('should get past event guests for logged-out user and restrict sensitive fields', async () => {
      // Mocking services and Prisma
      jest.spyOn(eventLocationsService, 'getPastEventsByLocation').mockResolvedValue(mockEvents);
      const modifiedMockGuests = mockGuests.map((guest) => ({
        ...guest,
        member: {
          ...guest.member,
          telegramHandler: null, // Sensitive fields should be restricted for logged-out users
          officeHours: null,
        },
        telegramId: null,
        officeHours: null,
      }));
      jest.spyOn(prismaService.pLEventGuest, 'findMany').mockResolvedValue(modifiedMockGuests);

      const result = await service.getPLEventGuestsByLocationAndType(mockLocationUid, 'past', false);

      // Check if the services are called with correct arguments
      expect(eventLocationsService.getPastEventsByLocation).toHaveBeenCalledWith(mockLocationUid);
      expect(prismaService.pLEventGuest.findMany).toHaveBeenCalledWith({
        where: {
          eventUid: { in: ['event1', 'event2'] },
        },
        select: expect.anything(), // Ensure the right select fields are passed
      });

      // Check if result matches the modified guest data (restricted for logged-out users)
      expect(result).toEqual(modifiedMockGuests);
    });

    it('should handle errors and call handleErrors', async () => {
      const error = new Error('Prisma error');
      jest.spyOn(eventLocationsService, 'getUpcomingEventsByLocation').mockRejectedValue(error);
      const handleErrorsMock = jest.spyOn(service as any, 'handleErrors');

      await expect(service.getPLEventGuestsByLocationAndType(mockLocationUid, 'upcoming', true)).rejects.toThrowError(
        'Prisma error'
      );
      expect(handleErrorsMock).toHaveBeenCalledWith(error);
    });
  });

  describe('deletePLEventGuests', () => {
    it('should delete event guests and reset cache', async () => {
      // Mock the deleteMany method
      const deleteManyMock = jest.spyOn(prismaService.pLEventGuest, 'deleteMany').mockResolvedValue({ count: 3 });

      // Execute the method
      const result = await service.deletePLEventGuests(mockMembersAndEvents);

      // Assert that deleteMany was called with the correct conditions
      expect(deleteManyMock).toHaveBeenCalledWith({
        where: {
          OR: [
            { memberUid: 'member1', eventUid: 'event1' },
            { memberUid: 'member1', eventUid: 'event2' },
            { memberUid: 'member2', eventUid: 'event3' },
          ],
        },
      });

      // Assert that cache reset was called
      expect(cacheService.reset).toHaveBeenCalled();

      // Assert the result
      expect(result).toEqual({ count: 3 });
    });

    it('should handle errors and call handleErrors', async () => {
      const error = new Error('Some error occurred');
      jest.spyOn(prismaService.pLEventGuest, 'deleteMany').mockRejectedValue(error);
      const handleErrorsMock = jest.spyOn(service as any, 'handleErrors');

      await expect(service.deletePLEventGuests(mockMembersAndEvents)).rejects.toThrowError('Some error occurred');

      // Assert that handleErrors was called
      expect(handleErrorsMock).toHaveBeenCalledWith(error);
    });
  });

  describe('updateMemberDetails', () => {
    const mockGuest: any = {
      memberUid: 'guest123',
      telegramId: 'newTelegramId',
      officeHours: '10:00 AM - 6:00 PM',
    };

    const mockMember: any = {
      uid: 'member123',
      telegramId: 'oldTelegramId',
      officeHours: '9:00 AM - 5:00 PM',
    };
    it('should update details for admin users', async () => {
      const isAdmin = true;

      const findOneMock = jest.spyOn(membersService, 'findOne').mockResolvedValue(mockMember);
      const updateTelegramMock = jest.spyOn(membersService, 'updateTelegramIfChanged').mockResolvedValue(undefined);
      const updateOfficeHoursMock = jest
        .spyOn(membersService, 'updateOfficeHoursIfChanged')
        .mockResolvedValue(undefined);

      await service.updateMemberDetails(mockGuest, mockMember, isAdmin);

      expect(findOneMock).toHaveBeenCalledWith(mockGuest.memberUid, {}, undefined);
      expect(updateTelegramMock).toHaveBeenCalledWith(mockMember, mockGuest.telegramId, undefined);
      expect(updateOfficeHoursMock).toHaveBeenCalledWith(mockMember, mockGuest.officeHours, undefined);
    });

    it('should update details for non-admin users', async () => {
      const isAdmin = false;

      const updateTelegramMock = jest.spyOn(membersService, 'updateTelegramIfChanged').mockResolvedValue(undefined);
      const updateOfficeHoursMock = jest
        .spyOn(membersService, 'updateOfficeHoursIfChanged')
        .mockResolvedValue(undefined);

      await service.updateMemberDetails(mockGuest, mockMember, isAdmin);

      expect(updateTelegramMock).toHaveBeenCalledWith(mockMember, mockGuest.telegramId, undefined);
      expect(updateOfficeHoursMock).toHaveBeenCalledWith(mockMember, mockGuest.officeHours, undefined);
    });
  });

  describe('restrictOfficeHours', () => {
    const eventGuests = [
      {
        member: { officeHours: '9:00 AM - 5:00 PM' },
        officeHours: '9:00 AM - 5:00 PM',
      },
      {
        member: { officeHours: '10:00 AM - 6:00 PM' },
        officeHours: null, // guest without office hours
      },
    ];
    it('should remove office hours for guests without office hours when user is logged in', () => {
      const result = service.restrictOfficeHours(eventGuests, true);
      expect(result).toEqual([
        {
          member: { officeHours: '9:00 AM - 5:00 PM' },
          officeHours: '9:00 AM - 5:00 PM',
        },
        {
          member: {}, // officeHours removed from member
          officeHours: null,
        },
      ]);
    });

    it('should not modify office hours when the user is not logged in', () => {
      const result = service.restrictOfficeHours(eventGuests, false);
      expect(result).toEqual(eventGuests); // officeHours should not be modified
    });

    it('should return the original eventGuests if no eventGuests are provided', () => {
      const result = service.restrictOfficeHours(null, true);
      expect(result).toBeNull();
      const resultEmptyArray = service.restrictOfficeHours([], true);
      expect(resultEmptyArray).toEqual([]);
    });
  });

  describe('restrictTelegramBasedOnMemberPreference', () => {
    it('should remove telegramHandler and telegramId when preferences do not allow showing Telegram', () => {
      const eventGuests = [
        {
          member: {
            preferences: { showTelegram: false },
            telegramHandler: 'telegramUser123',
          },
          telegramId: '12345',
        },
        {
          member: {
            preferences: { showTelegram: true },
            telegramHandler: 'telegramUser456',
          },
          telegramId: '67890',
        },
      ];

      const result = service.restrictTelegramBasedOnMemberPreference(eventGuests, true);

      expect(result).toEqual([
        {
          member: {
            preferences: { showTelegram: false },
            // telegramHandler removed
          },
          // telegramId removed
        },
        {
          member: {
            preferences: { showTelegram: true },
            telegramHandler: 'telegramUser456',
          },
          telegramId: '67890',
        },
      ]);
    });

    it('should not modify telegramHandler or telegramId when the user is not logged in', () => {
      const eventGuests = [
        {
          member: {
            preferences: { showTelegram: false },
            telegramHandler: 'telegramUser123',
          },
          telegramId: '12345',
        },
        {
          member: {
            preferences: { showTelegram: true },
            telegramHandler: 'telegramUser456',
          },
          telegramId: '67890',
        },
      ];

      const result = service.restrictTelegramBasedOnMemberPreference(eventGuests, false);

      expect(result).toEqual(eventGuests); // No changes when the user is not logged in
    });

    it('should return the original eventGuests if no preferences are provided', () => {
      const eventGuests = [
        {
          member: {
            preferences: null, // No preferences
            telegramHandler: 'telegramUser123',
          },
          telegramId: '12345',
        },
      ];

      const result = service.restrictTelegramBasedOnMemberPreference(eventGuests, true);

      expect(result).toEqual(eventGuests); // No changes when preferences are null
    });

    it('should return the original eventGuests if no eventGuests are provided', () => {
      const result = service.restrictTelegramBasedOnMemberPreference(null, true);
      expect(result).toBeNull();

      const resultEmptyArray = service.restrictTelegramBasedOnMemberPreference([], true);
      expect(resultEmptyArray).toEqual([]);
    });
  });


  describe('checkIfEventsAreUpcoming', () => {
    const upcomingEvents: any = [
      { uid: 'event1' },
      { uid: 'event2' },
      { uid: 'event3' },
    ];

    const events = [
      { uid: 'event1' },
      { uid: 'event2' },
    ];
    it('should return true when all events are in the upcoming events list', () => {
  
      const result = service.checkIfEventsAreUpcoming(upcomingEvents, events);
      expect(result).toBe(true);
    });
  
    it('should return false when at least one event is not in the upcoming events list', () => {
      const result = service.checkIfEventsAreUpcoming(upcomingEvents, events);
      expect(result).toBe(false);
    });
  
    it('should return true when there are no events to check', () => {
  
      const events = []; // Empty list of events
  
      const result = service.checkIfEventsAreUpcoming(upcomingEvents, events);
      expect(result).toBe(true);
    });
  
    it('should return false when there are no upcoming events', () => {
      const upcomingEvents = []; // No upcoming events

      const result = service.checkIfEventsAreUpcoming(upcomingEvents, events);
      expect(result).toBe(false);
    });
  });
  
  describe('handleErrors', () => {

    it('should handle errors and call handleErrors', async () => {
      const error = new Error('Some error occurred');
      jest.spyOn(prismaService.pLEventGuest, 'findMany').mockRejectedValue(error);
      const handleErrorsMock = jest.spyOn(service as any, 'handleErrors');

      await expect(service.getPLEventGuestsByLocation(mockMembersAndEvents as any, {} as any)).rejects.toThrowError('Some error occurred');

      // Assert that handleErrors was called
      expect(handleErrorsMock).toHaveBeenCalledWith(error);
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
});
