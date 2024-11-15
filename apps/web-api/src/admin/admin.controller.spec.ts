import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { AdminService } from './admin.service';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ParticipantType, ApprovalStatus } from '@prisma/client';
import { JwtService } from '../utils/jwt/jwt.service';
import { ParticipantProcessRequestSchema, ParticipantRequestMemberSchema, ParticipantRequestTeamSchema } from 'libs/contracts/src/schema/participants-request';

// Mock schemas
jest.mock('libs/contracts/src/schema/participants-request', () => ({
  ParticipantRequestMemberSchema: {
    safeParse: jest.fn().mockReturnValue({ success: true }), // Mock success for MEMBER schema
  },
  ParticipantRequestTeamSchema: {
    safeParse: jest.fn().mockReturnValue({ success: true }), // Mock success for TEAM schema
  },
  ParticipantProcessRequestSchema: {
    safeParse: jest.fn().mockReturnValue({ success: true }), // Mock success for process request schema
  },
}));

describe('AdminController', () => {
  let controller: AdminController;
  let participantsRequestService: ParticipantsRequestService;
  let adminService: AdminService;

  const mockParticipantsRequestService = {
    getAll: jest.fn(),
    getByUid: jest.fn(),
    addRequest: jest.fn(),
    updateRequest: jest.fn(),
    processRejectRequest: jest.fn(),
    processTeamCreateRequest: jest.fn(),
    processMemberCreateRequest: jest.fn(),
    processTeamEditRequest: jest.fn(),
    processMemberEditRequest: jest.fn(),
  };

  const mockAdminService = {
    signIn: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        { provide: ParticipantsRequestService, useValue: mockParticipantsRequestService },
        { provide: AdminService, useValue: mockAdminService },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
    participantsRequestService = module.get<ParticipantsRequestService>(ParticipantsRequestService);
    adminService = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('signIn', () => {
    it('should return a signed JWT token if credentials are valid', async () => {
      const body = { username: 'admin', password: 'password' };
      const token = { code: 1, accessToken: 'testToken' };
      jest.spyOn(adminService, 'signIn').mockResolvedValue(token);

      const result = await controller.signIn(body);
      expect(result).toEqual(token);
    });
  });

  describe('findAll', () => {
    it('should return all participants', async () => {
      const query = {};
      const mockResponse: any = [{ id: '1', name: 'Participant' }];
      jest.spyOn(participantsRequestService, 'getAll').mockResolvedValue(mockResponse);

      const result = await controller.findAll(query);
      expect(result).toEqual(mockResponse);
      expect(participantsRequestService.getAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findOne', () => {
    it('should return a participant by UID', async () => {
      const params = { uid: '123' };
      const mockResponse: any = { id: '123', name: 'Participant' };
      jest.spyOn(participantsRequestService, 'getByUid').mockResolvedValue(mockResponse);

      const result = await controller.findOne(params);
      expect(result).toEqual(mockResponse);
      expect(participantsRequestService.getByUid).toHaveBeenCalledWith(params.uid);
    });
  });

  describe('addRequest', () => {
    it('should call addRequest with valid MEMBER schema', async () => {
      const body = { participantType: ParticipantType.MEMBER, name: 'John Doe' };
      const mockResponse: any = { id: '1', ...body };
      jest.spyOn(participantsRequestService, 'addRequest').mockResolvedValue(mockResponse);

      const result = await controller.addRequest(body);
      expect(result).toEqual(mockResponse);
      expect(participantsRequestService.addRequest).toHaveBeenCalledWith(body);
    });

    it('should call addRequest with valid TEAM schema', async () => {
      const body = { participantType: ParticipantType.TEAM, name: 'Team A' };
      const mockResponse: any = { id: '2', ...body };
      jest.spyOn(participantsRequestService, 'addRequest').mockResolvedValue(mockResponse);

      const result = await controller.addRequest(body);
      expect(result).toEqual(mockResponse);
      expect(participantsRequestService.addRequest).toHaveBeenCalledWith(body);
    });
  });

  describe('updateRequest', () => {
    it('should call updateRequest with valid MEMBER schema', async () => {
      const body = { participantType: ParticipantType.MEMBER, name: 'Updated Name' };
      const params = { uid: '123' };
      const mockResponse: any = { id: '123', ...body };
      jest.spyOn(participantsRequestService, 'updateRequest').mockResolvedValue(mockResponse);

      const result = await controller.updateRequest(body, params);
      expect(result).toEqual(mockResponse);
      expect(participantsRequestService.updateRequest).toHaveBeenCalledWith(body, params.uid);
    });

    it('should call updateRequest with valid TEAM schema', async () => {
      const body = { participantType: ParticipantType.TEAM, name: 'Updated Team' };
      const params = { uid: '123' };
      const mockResponse: any = { id: '123', ...body };
      jest.spyOn(participantsRequestService, 'updateRequest').mockResolvedValue(mockResponse);

      const result = await controller.updateRequest(body, params);
      expect(result).toEqual(mockResponse);
      expect(participantsRequestService.updateRequest).toHaveBeenCalledWith(body, params.uid);
    });
  });

  describe('processRequest', () => {
    it('should call processRejectRequest when status is REJECTED', async () => {
      const body = { participantType: 'MEMBER', status: ApprovalStatus.REJECTED };
      const params = { uid: '123' };
      jest.spyOn(participantsRequestService, 'processRejectRequest').mockResolvedValue('success' as any);

      const result = await controller.processRequest(body, params);
      expect(result).toEqual('success');
      expect(participantsRequestService.processRejectRequest).toHaveBeenCalledWith(params.uid);
    });

    it('should call processTeamCreateRequest when status is APPROVED for TEAM without referenceUid', async () => {
      const body = { participantType: 'TEAM', status: ApprovalStatus.APPROVED };
      const params = { uid: '123' };
      jest.spyOn(participantsRequestService, 'processTeamCreateRequest').mockResolvedValue('success' as any);

      const result = await controller.processRequest(body, params);
      expect(result).toEqual('success');
      expect(participantsRequestService.processTeamCreateRequest).toHaveBeenCalledWith(params.uid);
    });

    it('should call processMemberCreateRequest when status is APPROVED for MEMBER without referenceUid', async () => {
      const body = { participantType: 'MEMBER', status: ApprovalStatus.APPROVED };
      const params = { uid: '123' };
      jest.spyOn(participantsRequestService, 'processMemberCreateRequest').mockResolvedValue('success' as any);

      const result = await controller.processRequest(body, params);
      expect(result).toEqual('success');
      expect(participantsRequestService.processMemberCreateRequest).toHaveBeenCalledWith(params.uid);
    });

    it('should call processTeamEditRequest when status is APPROVED for TEAM with referenceUid', async () => {
      const body = { participantType: 'TEAM', status: ApprovalStatus.APPROVED, referenceUid: '456' };
      const params = { uid: '123' };
      jest.spyOn(participantsRequestService, 'processTeamEditRequest').mockResolvedValue('success' as any);

      const result = await controller.processRequest(body, params);
      expect(result).toEqual('success');
      expect(participantsRequestService.processTeamEditRequest).toHaveBeenCalledWith(params.uid);
    });

    it('should call processMemberEditRequest when status is APPROVED for MEMBER with referenceUid', async () => {
      const body = { participantType: 'MEMBER', status: ApprovalStatus.APPROVED, referenceUid: '456' };
      const params = { uid: '123' };
      jest.spyOn(participantsRequestService, 'processMemberEditRequest').mockResolvedValue('success' as any);

      const result = await controller.processRequest(body, params);
      expect(result).toEqual('success');
      expect(participantsRequestService.processMemberEditRequest).toHaveBeenCalledWith(params.uid);
    });
  });

  describe('AdminController - ForbiddenException Scenarios', () => {
  

    describe('addRequest - ForbiddenException cases', () => {
      it('should throw ForbiddenException for invalid MEMBER schema', async () => {
        const body = { participantType: ParticipantType.MEMBER, invalidField: 'error' };
        jest.spyOn(ParticipantRequestMemberSchema, 'safeParse').mockReturnValueOnce({ success: false } as any);

        await expect(controller.addRequest(body)).rejects.toThrow(ForbiddenException);
      });

      it('should throw ForbiddenException for invalid TEAM schema', async () => {
        const body = { participantType: ParticipantType.TEAM, invalidField: 'error' };
        jest.spyOn(ParticipantRequestTeamSchema, 'safeParse').mockReturnValueOnce({ success: false } as any);

        await expect(controller.addRequest(body)).rejects.toThrow(ForbiddenException);
      });

      it('should throw ForbiddenException for unknown participant type', async () => {
        const body = { participantType: 'UNKNOWN_TYPE' };

        await expect(controller.addRequest(body)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('updateRequest - ForbiddenException cases', () => {
      it('should throw ForbiddenException for invalid MEMBER schema on update', async () => {
        const body = { participantType: ParticipantType.MEMBER, invalidField: 'error' };
        const params = { uid: '123' };
        jest.spyOn(ParticipantRequestMemberSchema, 'safeParse').mockReturnValueOnce({ success: false } as any);

        await expect(controller.updateRequest(body, params)).rejects.toThrow(ForbiddenException);
      });

      it('should throw ForbiddenException for invalid TEAM schema on update', async () => {
        const body = { participantType: ParticipantType.TEAM, invalidField: 'error' };
        const params = { uid: '123' };
        jest.spyOn(ParticipantRequestTeamSchema, 'safeParse').mockReturnValueOnce({ success: false } as any);

        await expect(controller.updateRequest(body, params)).rejects.toThrow(ForbiddenException);
      });
    });

    describe('processRequest - ForbiddenException case', () => {
      it('should throw ForbiddenException for invalid process request schema', async () => {
        const body = { status: 'INVALID_STATUS' };
        const params = { uid: '123' };
        jest.spyOn(ParticipantProcessRequestSchema, 'safeParse').mockReturnValueOnce({ success: false } as any);

        await expect(controller.processRequest(body, params)).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
