import { Test, TestingModule } from '@nestjs/testing';
import { PLEventsController } from './pl-events.controller';
import { PLEventsService } from './pl-events.service';
import { PLEventGuestsService } from './pl-event-guests.service';
import { MembersService } from '../members/members.service';
import { PLEventLocationsService } from './pl-event-locations.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('PLEventsController', () => {
  let controller: PLEventsController;
  let eventService: jest.Mocked<PLEventsService>;
  let eventLocationService: jest.Mocked<PLEventLocationsService>;
  let eventGuestService: jest.Mocked<PLEventGuestsService>;
  let memberService: jest.Mocked<MembersService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PLEventsController],
      providers: [
        {
          provide: PLEventsService,
          useValue: { getPLEventBySlug: jest.fn(), getPLEventsByMember: jest.fn() },
        },
        {
          provide: PLEventLocationsService,
          useValue: { getPLEventLocationByUid: jest.fn(), getPLEventLocations: jest.fn() },
        },
        {
          provide: PLEventGuestsService,
          useValue: {
            getPLEventGuestsByLocationAndType: jest.fn(),
            checkIfEventsAreUpcoming: jest.fn(),
            deletePLEventGuests: jest.fn(),
          },
        },
        {
          provide: MembersService,
          useValue: { findMemberByEmail: jest.fn(), isMemberPartOfTeams: jest.fn(), checkIfAdminUser: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<PLEventsController>(PLEventsController);
    eventService = module.get(PLEventsService);
    eventLocationService = module.get(PLEventLocationsService);
    eventGuestService = module.get(PLEventGuestsService);
    memberService = module.get(MembersService);
  });

  describe('findPLEventGuestsByLocation', () => {
    it('should return event guests based on location and type', async () => {
      const mockLocationUid = 'test-location-uid';
      const mockType = 'guest';
      const mockRequest = { query: { type: mockType }, isUserLoggedIn: true } as any;
      const mockResponse = [{ id: 1, name: 'Guest 1' }];

      eventGuestService.getPLEventGuestsByLocationAndType.mockResolvedValue(mockResponse as any);

      const result = await controller.findPLEventGuestsByLocation(mockRequest, mockLocationUid);

      expect(result).toEqual(mockResponse);
      expect(eventGuestService.getPLEventGuestsByLocationAndType).toHaveBeenCalledWith(
        mockLocationUid,
        mockType,
        mockRequest.isUserLoggedIn
      );
    });
  });

  describe('findOne', () => {
    it('should return the event when found by slug', async () => {
      const mockSlug = 'test-slug';
      const mockRequest = { isUserLoggedIn: true } as any;
      const mockEvent: any = { id: 1, slug: mockSlug, name: 'Test Event' };

      // Mocking the event service to return a mock event
      eventService.getPLEventBySlug.mockResolvedValue(mockEvent);

      const result = await controller.findOne({ params: { slug: mockSlug } } as any, mockRequest);

      expect(result).toEqual(mockEvent);
      expect(eventService.getPLEventBySlug).toHaveBeenCalledWith(mockSlug, mockRequest.isUserLoggedIn);
    });

    it('should throw NotFoundException if the event is not found', async () => {
      const mockSlug = 'test-slug';
      const mockRequest = { isUserLoggedIn: true } as any;

      // Mocking the event service to return null for not found event
      eventService.getPLEventBySlug.mockResolvedValue(null as any);

      await expect(controller.findOne({ params: { slug: mockSlug } } as any, mockRequest)).rejects.toThrow(
        NotFoundException
      );
      await expect(controller.findOne({ params: { slug: mockSlug } } as any, mockRequest)).rejects.toThrow(
        `Event not found with slug: ${mockSlug}.`
      );
    });
  });

  describe('getPLEventsByLoggedInMember', () => {
    it('should retrieve events for the logged-in member', async () => {
      const mockRequest = {
        userEmail: 'test@example.com',
      } as any;

      const mockMember = { id: 'member-id', email: 'test@example.com' };
      const mockEvents = [
        { id: 'event-1', name: 'Event 1' },
        { id: 'event-2', name: 'Event 2' },
      ];

      // Mock implementations
      (memberService.findMemberByEmail as jest.Mock).mockResolvedValue(mockMember);
      (eventService.getPLEventsByMember as jest.Mock).mockResolvedValue(mockEvents);

      const result = await controller.getPLEventsByLoggedInMember(mockRequest);

      expect(result).toEqual(mockEvents);
      expect(memberService.findMemberByEmail).toHaveBeenCalledWith('test@example.com');
      expect(eventService.getPLEventsByMember).toHaveBeenCalledWith(mockMember);
    });
  });

  describe('deletePLEventGuestsByLocation', () => {
    it('should delete PLEvent guests when user is admin', async () => {
      const mockRequest = {
        userEmail: 'admin@example.com',
      } as any;

      const locationUid = 'location-uid';
      const body: any = {
        membersAndEvents: [{ memberUid: 'member-uid' }],
      };

      const mockMember = { uid: 'admin-member-uid', email: 'admin@example.com' };

      // Mock implementations
      (memberService.findMemberByEmail as jest.Mock).mockResolvedValue(mockMember);
      (memberService.checkIfAdminUser as jest.Mock).mockResolvedValue(true);
      (eventGuestService.deletePLEventGuests as jest.Mock).mockResolvedValue({ success: true } as any);

      const result = await controller.deletePLEventGuestsByLocation(locationUid, body, mockRequest);

      expect(result).toEqual({ success: true });
      expect(memberService.findMemberByEmail).toHaveBeenCalledWith('admin@example.com');
      expect(memberService.checkIfAdminUser).toHaveBeenCalledWith(mockMember);
      expect(eventGuestService.deletePLEventGuests).toHaveBeenCalledWith(body.membersAndEvents);
    });

    it('should throw ForbiddenException if user is not admin and memberUid does not match', async () => {
      const mockRequest = {
        userEmail: 'user@example.com',
      } as unknown as Request;

      const locationUid = 'location-uid';
      const body: any = {
        membersAndEvents: [{ memberUid: 'different-member-uid' }],
      };

      const mockMember = { uid: 'user-member-uid', email: 'user@example.com' };

      // Mock implementations
      (memberService.findMemberByEmail as jest.Mock).mockResolvedValue(mockMember);
      (memberService.checkIfAdminUser as jest.Mock).mockResolvedValue(false);

      await expect(controller.deletePLEventGuestsByLocation(locationUid, body, mockRequest)).rejects.toThrow(ForbiddenException);

      expect(memberService.findMemberByEmail).toHaveBeenCalledWith('user@example.com');
      expect(memberService.checkIfAdminUser).toHaveBeenCalledWith(mockMember);
    });
  });
});
