import { Test, TestingModule } from '@nestjs/testing';
import { OfficeHoursController } from './office-hours.controller';
import { MembersService } from '../members/members.service';
import { OfficeHoursService } from './office-hours.service';
import { MemberFollowUpsService } from '../member-follow-ups/member-follow-ups.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('OfficeHoursController', () => {
  let controller: OfficeHoursController;
  let membersService: MembersService;
  let officeHoursService: OfficeHoursService;
  let followUpsService: MemberFollowUpsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OfficeHoursController],
      providers: [
        {
          provide: MembersService,
          useValue: {
            findMemberByEmail: jest.fn(),
          },
        },
        {
          provide: OfficeHoursService,
          useValue: {
            findInteractions: jest.fn(),
            createInteraction: jest.fn(),
            createInteractionFeedback: jest.fn(),
            closeMemberInteractionFollowUpByID: jest.fn()
          },
        },
        {
          provide: MemberFollowUpsService,
          useValue: {
            getFollowUps: jest.fn(),
            buildDelayedFollowUpQuery: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<OfficeHoursController>(OfficeHoursController);
    membersService = module.get<MembersService>(MembersService);
    officeHoursService = module.get<OfficeHoursService>(OfficeHoursService);
    followUpsService = module.get<MemberFollowUpsService>(MemberFollowUpsService);
  });

  it('should create a member interaction', async () => {
    const request: any = {
      userEmail: 'test@example.com',
    };
    const body = {
      targetMemberUid: 'targetUid',
    };
    const member: any = {
      uid: 'memberUid',
      email: 'test@example.com',
    };

    jest.spyOn(membersService, 'findMemberByEmail').mockResolvedValue(member);
    jest.spyOn(officeHoursService, 'findInteractions').mockResolvedValue([]);
    jest.spyOn(officeHoursService, 'createInteraction').mockResolvedValue({} as any); // Mock the createInteraction method

    const result = await controller.createMemberInteraction(body as any, request);

    expect(membersService.findMemberByEmail).toHaveBeenCalledWith(member);
    expect(officeHoursService.findInteractions).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({});
  });

  it('should throw ForbiddenException for interaction with same user', async () => {
    const body = {
      targetMemberUid: 'memberUid',
    };
    const member = {
      uid: 'memberUid',
      email: 'test@example.com',
    };

    jest.spyOn(membersService, 'findMemberByEmail').mockReturnValue(member as any);
    jest.spyOn(officeHoursService, 'findInteractions').mockResolvedValue([]);

    await expect(controller.createMemberInteraction(body as any, {} as any)).rejects.toThrow(ForbiddenException);
  });

  it('should find all member interaction follow-ups', async () => {
    const request = {
      userEmail: 'test@example.com',
      query: {},
    } as any;
    const member = {
      uid: 'memberUid',
      email: 'test@example.com',
    };

    const followUps = [{ uid: 'followUpUid' }];

    jest.spyOn(membersService, 'findMemberByEmail').mockResolvedValue(member as any);
    jest.spyOn(followUpsService, 'getFollowUps').mockResolvedValue(followUps as any);

    const result = await controller.findAll(request);

    expect(membersService.findMemberByEmail).toHaveBeenCalledWith(request.userEmail);
    expect(followUpsService.getFollowUps).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual(followUps);
  });

  it('should create member interaction feedback', async () => {
    const request = {
      userEmail: 'test@example.com',
    } as any;
    const body: any = {};
    const interactionFollowUpUid = 'followUpUid';
    const member: any = {
      uid: 'memberUid',
      email: 'test@example.com',
    };
    const followUps = [{ uid: 'followUpUid' }];

    jest.spyOn(membersService, 'findMemberByEmail').mockResolvedValue(member as any);
    jest.spyOn(followUpsService, 'getFollowUps').mockResolvedValue(followUps as any);
    jest.spyOn(officeHoursService, 'createInteractionFeedback').mockResolvedValue(body);

    const result = await controller.createMemberInteractionFeedback(interactionFollowUpUid, body, request);

    expect(membersService.findMemberByEmail).toHaveBeenCalledWith(request.userEmail);
    expect(followUpsService.getFollowUps).toHaveBeenCalledWith(expect.anything());
    expect(result).toEqual({});
  });

  it('should handle status query with comma-separated values', async () => {
    // Mock request with a status query
    const request = {
      query: {
        status: 'PENDING,CLOSED',
      },
      userEmail: 'test@example.com',
    } as any

    const member: any = { uid: 'memberUid', email: 'test@example.com' };

    // Mocking services
    jest.spyOn(membersService, 'findMemberByEmail').mockResolvedValue(member);
    jest.spyOn(followUpsService, 'getFollowUps').mockResolvedValue([]);

    // Call the findAll method
    await controller.findAll(request);

    // Verify that getFollowUps was called with the correct query
    expect(followUpsService.getFollowUps).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            expect.objectContaining({
              status: { in: ['PENDING', 'CLOSED'] },
            }),
          ]),
        },
      })
    );

    // Verify that findMemberByEmail was called
    expect(membersService.findMemberByEmail).toHaveBeenCalledWith(request.userEmail);
  });

  it('should create member interaction feedback', async () => {
    // Mock request object
    const request = {
      userEmail: 'test@example.com',
    } as any;

    // Mock input data
    const body: any = {
      feedback: 'Some feedback',
    }; // CreateMemberFeedbackSchemaDto mock
    const interactionFollowUpUid = 'followUpUid';

    // Mock member and follow-up data
    const member: any = { uid: 'memberUid', email: 'test@example.com' };
    const followUps: any = [
      {
        uid: 'followUpUid',
        createdBy: 'memberUid',
        status: 'PENDING',
      },
    ];

    // Mock services behavior
    jest.spyOn(membersService, 'findMemberByEmail').mockResolvedValue(member);
    jest.spyOn(followUpsService, 'getFollowUps').mockResolvedValue(followUps);
    jest.spyOn(officeHoursService, 'createInteractionFeedback').mockResolvedValue({} as any);

    // Call the controller method
    const result = await controller.createMemberInteractionFeedback(interactionFollowUpUid, body, request);

    // Verify service calls
    expect(membersService.findMemberByEmail).toHaveBeenCalledWith(request.userEmail);
    expect(followUpsService.getFollowUps).toHaveBeenCalledWith({
      where: {
        uid: interactionFollowUpUid,
        createdBy: member.uid,
        status: {
          in: ['PENDING', 'CLOSED'],
        },
      },
    });
    expect(officeHoursService.createInteractionFeedback).toHaveBeenCalledWith(body, member, followUps[0]);

    // Verify return value
    expect(result).toEqual({});
  });

  it('should throw NotFoundException if no follow-up is found', async () => {
    // Mock request object
    const request = {
      userEmail: 'test@example.com',
    } as any;

    // Mock input data
    const body: any = {
      feedback: 'Some feedback',
    }; // CreateMemberFeedbackSchemaDto mock
    const interactionFollowUpUid = 'followUpUid';

    // Mock member and empty follow-up data
    const member: any = { uid: 'memberUid', email: 'test@example.com' };
    const followUps: any[] = [];

    // Mock services behavior
    jest.spyOn(membersService, 'findMemberByEmail').mockResolvedValue(member);
    jest.spyOn(followUpsService, 'getFollowUps').mockResolvedValue(followUps);

    // Expecting the method to throw a NotFoundException
    await expect(controller.createMemberInteractionFeedback(interactionFollowUpUid, body, request)).rejects.toThrow(
      NotFoundException
    );

    // Verify service calls
    expect(membersService.findMemberByEmail).toHaveBeenCalledWith(request.userEmail);
    expect(followUpsService.getFollowUps).toHaveBeenCalledWith({
      where: {
        uid: interactionFollowUpUid,
        createdBy: member.uid,
        status: {
          in: ['PENDING', 'CLOSED'],
        },
      },
    });
  });

  it('should close member interaction follow-up', async () => {
    // Mock request object
    const request = {
      userEmail: 'test@example.com',
    } as any;

    // Mock input parameters
    const interactionUid = 'interactionUid';
    const followUpUid = 'followUpUid';

    // Mock member and follow-up data
    const member: any = { uid: 'memberUid', email: 'test@example.com' };
    const followUps: any = [
      {
        uid: 'followUpUid',
        interactionUid: 'interactionUid',
        createdBy: 'memberUid',
        status: 'PENDING',
      },
    ];

    // Mock services behavior
    jest.spyOn(membersService, 'findMemberByEmail').mockResolvedValue(member);
    jest.spyOn(followUpsService, 'getFollowUps').mockResolvedValue(followUps);
    jest.spyOn(officeHoursService, 'closeMemberInteractionFollowUpByID').mockResolvedValue({} as any);

    // Call the controller method
    const result = await controller.closeMemberInteractionFollowUp(interactionUid, followUpUid, request);

    // Verify service calls
    expect(membersService.findMemberByEmail).toHaveBeenCalledWith(request.userEmail);
    expect(followUpsService.getFollowUps).toHaveBeenCalledWith({
      where: {
        uid: followUpUid,
        interactionUid,
        createdBy: member.uid,
        status: 'PENDING',
      },
    });
    expect(officeHoursService.closeMemberInteractionFollowUpByID).toHaveBeenCalledWith(followUpUid);

    // Verify return value
    expect(result).toEqual({});
  });


  it('should throw ForbiddenException if an interaction with the same user exists within the interval', async () => {
    // Mock request object
    const request = {
      userEmail: 'test@example.com',
    } as any;

    // Mock input parameters
    const body: any = {
      targetMemberUid: 'targetUid',
    };
    const member: any = { uid: 'memberUid', email: 'test@example.com' };

    // Set interaction interval
    const interval = 1800000; // 30 minutes

    // Mock result of `findInteractions` to simulate existing interaction with the same user
    const result: any = [
      {
        interactionFollowUps: [
          {
            type: 'MEETING_INITIATED',
            status: 'PENDING',
          },
        ],
      },
    ];

    // Mock services behavior
    jest.spyOn(membersService, 'findMemberByEmail').mockResolvedValue(member);
    jest.spyOn(officeHoursService, 'findInteractions').mockResolvedValue(result);

    // Expecting the method to throw a ForbiddenException
    await expect(
      controller.createMemberInteraction(body as any, request)
    ).rejects.toThrow(ForbiddenException);

    // Verify service calls
    expect(membersService.findMemberByEmail).toHaveBeenCalledWith(request.userEmail);
    expect(officeHoursService.findInteractions).toHaveBeenCalledWith({
      where: {
        sourceMemberUid: member.uid,
        targetMemberUid: body.targetMemberUid,
        createdAt: {
          gte: expect.any(Date), // Expecting the date query to be present
        },
      },
      include: {
        interactionFollowUps: {
          where: {
            type: 'MEETING_INITIATED',
            status: {
              in: ['PENDING', 'CLOSED'],
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  });
});
