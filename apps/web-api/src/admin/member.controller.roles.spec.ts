// The `ai` / `@ai-sdk/*` packages ship untranspiled ESM that this jest config can't parse;
// stub the module boundary, same pattern as member-enrichment.service.spec.ts.
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { responses: jest.fn(), tools: { webSearchPreview: jest.fn() } }),
}));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));
// cheerio and open-graph-scraper load undici, which needs web globals the jest node environment lacks.
jest.mock('cheerio', () => ({}));
jest.mock('open-graph-scraper', () => jest.fn());
jest.mock('p-limit', () => ({ __esModule: true, default: () => (fn: () => unknown) => fn() }));

import { ForbiddenException } from '@nestjs/common';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';

describe('MemberController role grants', () => {
  const memberService = {
    findMemberByUid: jest.fn().mockResolvedValue({ memberRoles: [{ name: 'EVENT_HOST' }] }),
    updateMemberRolesByUid: jest.fn(),
    updateMemberRolesAndHosts: jest.fn(),
  };
  const controller = new MemberController(memberService as any, {} as any, {} as any, {} as any);
  const demoDayAdminReq = { user: { effectivePermissionCodes: ['demoday.admin.all'] } };
  const directoryAdminReq = { user: { effectivePermissionCodes: ['directory.admin.full'] } };

  beforeEach(() => jest.clearAllMocks());

  it('rejects a demo day admin granting DIRECTORY_ADMIN via /roles', async () => {
    await expect(controller.updateMemberRoles(demoDayAdminReq, 'u1', { roles: ['DIRECTORY_ADMIN'] })).rejects.toThrow(
      ForbiddenException
    );
    expect(memberService.updateMemberRolesByUid).not.toHaveBeenCalled();
  });

  it('rejects a demo day admin granting DIRECTORY_ADMIN via /roles-and-hosts', async () => {
    await expect(
      controller.updateMemberRolesAndHosts(demoDayAdminReq, 'u1', { roles: ['DIRECTORY_ADMIN'], hosts: [] })
    ).rejects.toThrow(ForbiddenException);
    expect(memberService.updateMemberRolesAndHosts).not.toHaveBeenCalled();
  });

  it('lets a demo day admin grant DEMO_DAY_ADMIN while keeping other roles', async () => {
    await controller.updateMemberRoles(demoDayAdminReq, 'u1', { roles: ['demo_day_admin'] });
    expect(memberService.updateMemberRolesByUid).toHaveBeenCalledWith('u1', ['EVENT_HOST', 'DEMO_DAY_ADMIN']);
  });

  it('lets a demo day admin resend roles the member already holds', async () => {
    await controller.updateMemberRoles(demoDayAdminReq, 'u1', { roles: ['EVENT_HOST', 'DEMO_DAY_ADMIN'] });
    expect(memberService.updateMemberRolesByUid).toHaveBeenCalledWith('u1', ['EVENT_HOST', 'DEMO_DAY_ADMIN']);
  });

  it('rejects a demo day admin granting a padded, lower-case DIRECTORY_ADMIN', async () => {
    await expect(controller.updateMemberRoles(demoDayAdminReq, 'u1', { roles: [' directory_admin '] })).rejects.toThrow(
      ForbiddenException
    );
    expect(memberService.updateMemberRolesByUid).not.toHaveBeenCalled();
  });

  it('treats a request without a user as a non-admin', async () => {
    await expect(controller.updateMemberRoles({}, 'u1', { roles: ['DIRECTORY_ADMIN'] })).rejects.toThrow(
      ForbiddenException
    );
  });

  it('lets a directory admin grant any role', async () => {
    await controller.updateMemberRoles(directoryAdminReq, 'u1', { roles: ['DIRECTORY_ADMIN'] });
    expect(memberService.updateMemberRolesByUid).toHaveBeenCalledWith('u1', ['DIRECTORY_ADMIN']);
  });
});

describe('MemberController access-code and email changes', () => {
  const current = {
    email: 'jane@example.com',
    roleCodes: ['member'],
    policyCodes: ['member_default'],
    permissionCodes: [],
  };
  const memberService = {
    findMemberByUid: jest.fn().mockResolvedValue(current),
    findMemberByRole: jest.fn().mockResolvedValue({ email: 'admin@example.com' }),
    createMemberByAdmin: jest.fn(),
    updateMemberByAdmin: jest.fn(),
    updateMemberFromParticipantsRequest: jest.fn(),
  };
  const controller = new MemberController(memberService as any, {} as any, {} as any, {} as any);
  const hostAdminReq = { user: { effectivePermissionCodes: ['demoday.admin.acme'] } };
  const directoryAdminReq = { user: { effectivePermissionCodes: ['directory.admin.full'] } };

  beforeEach(() => jest.clearAllMocks());

  it('marks a demo day admin as a non-directory admin on PATCH /:uid, so submitted access codes are not applied', async () => {
    const body = {
      newData: { ...current, permissionCodes: ['directory.admin.full'], policyCodes: ['directory_admin_pl_internal'] },
    };
    await controller.updateMemberAndVerify(hostAdminReq, 'u1', body);
    expect(memberService.updateMemberFromParticipantsRequest).toHaveBeenCalledWith(
      'u1',
      body,
      'admin@example.com',
      false
    );
  });

  it('lets a demo day admin change only the member state via PATCH /:uid', async () => {
    const body = { memberState: 'APPROVED' };
    await controller.updateMemberAndVerify(hostAdminReq, 'u1', body);
    expect(memberService.updateMemberFromParticipantsRequest).toHaveBeenCalledWith(
      'u1',
      body,
      'admin@example.com',
      false
    );
  });

  it('rejects a demo day admin changing a member email via PATCH /:uid', async () => {
    const body = { newData: { ...current, email: 'attacker@example.com' } };
    await expect(controller.updateMemberAndVerify(hostAdminReq, 'u1', body)).rejects.toThrow(ForbiddenException);
    expect(memberService.updateMemberFromParticipantsRequest).not.toHaveBeenCalled();
  });

  it('rejects a demo day admin clearing a member email via PATCH /:uid', async () => {
    const body = { newData: { ...current, email: null } };
    await expect(controller.updateMemberAndVerify(hostAdminReq, 'u1', body)).rejects.toThrow(ForbiddenException);
    expect(memberService.updateMemberFromParticipantsRequest).not.toHaveBeenCalled();
  });

  it('rejects a demo day admin sending a non-string email via PATCH /:uid', async () => {
    const body = { newData: { ...current, email: ['jane@example.com'] } };
    await expect(controller.updateMemberAndVerify(hostAdminReq, 'u1', body)).rejects.toThrow(ForbiddenException);
    expect(memberService.updateMemberFromParticipantsRequest).not.toHaveBeenCalled();
  });

  it('lets a demo day admin save a profile that resends the email in another case', async () => {
    const body = { newData: { ...current, email: 'Jane@Example.com', bio: 'hello' } };
    await controller.updateMemberAndVerify(hostAdminReq, 'u1', body);
    expect(memberService.updateMemberFromParticipantsRequest).toHaveBeenCalledWith(
      'u1',
      body,
      'admin@example.com',
      false
    );
  });

  it('lets a directory admin change access codes and email via PATCH /:uid', async () => {
    const body = { newData: { ...current, email: 'new@example.com', permissionCodes: ['directory.admin.full'] } };
    await controller.updateMemberAndVerify(directoryAdminReq, 'u1', body);
    expect(memberService.updateMemberFromParticipantsRequest).toHaveBeenCalledWith(
      'u1',
      body,
      'admin@example.com',
      true
    );
  });

  it('rejects a demo day admin creating a member with access codes', async () => {
    const body = { email: 'new@example.com', permissionCodes: ['directory.admin.full'] };
    await expect(controller.addNewMember(hostAdminReq, body)).rejects.toThrow(ForbiddenException);
    expect(memberService.createMemberByAdmin).not.toHaveBeenCalled();
  });

  it('rejects a demo day admin creating a member with a single-string access code', async () => {
    const body = { email: 'new@example.com', policyCodes: 'directory_admin_pl_internal' };
    await expect(controller.addNewMember(hostAdminReq, body)).rejects.toThrow(ForbiddenException);
    expect(memberService.createMemberByAdmin).not.toHaveBeenCalled();
  });

  it('lets a demo day admin create a member without access codes', async () => {
    const body = { email: 'new@example.com', roleCodes: [], policyCodes: [], permissionCodes: [] };
    await controller.addNewMember(hostAdminReq, body);
    expect(memberService.createMemberByAdmin).toHaveBeenCalledWith(body);
  });

  it('ignores blank access codes on create but still rejects real ones', async () => {
    const blank = { email: 'new@example.com', roleCodes: [''] };
    await controller.addNewMember(hostAdminReq, blank);
    expect(memberService.createMemberByAdmin).toHaveBeenCalledWith(blank);

    await expect(controller.addNewMember(hostAdminReq, { email: 'new@example.com', roleCodes: ['x'] })).rejects.toThrow(
      ForbiddenException
    );
  });

  it('lets a directory admin create a member with access codes', async () => {
    const body = { email: 'new@example.com', permissionCodes: ['directory.admin.full'] };
    await controller.addNewMember(directoryAdminReq, body);
    expect(memberService.createMemberByAdmin).toHaveBeenCalledWith(body);
  });

  it('rejects a demo day admin changing a member email via /edit/:uid', async () => {
    await expect(controller.editMember(hostAdminReq, 'u1', { email: 'attacker@example.com' } as any)).rejects.toThrow(
      ForbiddenException
    );
    expect(memberService.updateMemberByAdmin).not.toHaveBeenCalled();
  });

  it('lets a demo day admin edit a member while resending the same email', async () => {
    await controller.editMember(hostAdminReq, 'u1', { email: 'JANE@example.com', bio: 'hello' } as any);
    expect(memberService.updateMemberByAdmin).toHaveBeenCalled();
  });

  it('lets a directory admin change a member email via /edit/:uid', async () => {
    await controller.editMember(directoryAdminReq, 'u1', { email: 'new@example.com' } as any);
    expect(memberService.updateMemberByAdmin).toHaveBeenCalledWith('u1', { email: 'new@example.com' });
  });

  it('treats a request without a user as a non-admin', async () => {
    await expect(controller.addNewMember({}, { email: 'new@example.com', roleCodes: ['member'] })).rejects.toThrow(
      ForbiddenException
    );
  });

  it('lets a demo day admin save a member that has no email, resending null or an empty email', async () => {
    const noEmail = { ...current, email: null };
    memberService.findMemberByUid.mockResolvedValueOnce(noEmail).mockResolvedValueOnce(noEmail);
    await controller.updateMemberAndVerify(hostAdminReq, 'u1', { newData: { ...noEmail, bio: 'hello' } });
    await controller.updateMemberAndVerify(hostAdminReq, 'u1', { newData: { ...noEmail, email: '' } });
    expect(memberService.updateMemberFromParticipantsRequest).toHaveBeenCalledTimes(2);
  });
});

describe('MemberService.updateMemberFromParticipantsRequest access replacement', () => {
  const build = () => {
    const service: any = Object.create(MemberService.prototype);
    service.prisma = { $transaction: (cb: (tx: unknown) => unknown) => cb({}) };
    service.logger = { info: jest.fn() };
    service.findMemberByUid = jest.fn().mockResolvedValue({ uid: 'u1', email: 'jane@example.com', externalId: null });
    service.checkIfEmailChanged = jest.fn().mockResolvedValue(false);
    service.prepareMemberFromParticipantRequest = jest
      .fn()
      .mockResolvedValue({ member: {}, investorProfileData: null });
    service.mapLocationToMember = jest.fn();
    service.updateMemberByUid = jest.fn().mockResolvedValue({ uid: 'u1' });
    service.updateMemberEmailChange = jest.fn();
    service.syncMemberApprovalFromPayload = jest.fn();
    service.replaceAccessControl = jest.fn();
    service.memberHasPermissionCode = jest.fn().mockResolvedValue(false);
    service.membersHooksService = { postUpdateActions: jest.fn() };
    service.notificationService = { notifyForMemberChangesByAdmin: jest.fn() };
    return service;
  };
  const request = { newData: { email: 'jane@example.com', bio: 'hello' } } as any;

  it('keeps access codes when the caller is not a directory admin', async () => {
    const service = build();
    await service.updateMemberFromParticipantsRequest('u1', request, 'admin@example.com', false);
    expect(service.replaceAccessControl).not.toHaveBeenCalled();
  });

  it('replaces access codes when the caller is a directory admin', async () => {
    const service = build();
    await service.updateMemberFromParticipantsRequest('u1', request, 'admin@example.com', true);
    expect(service.replaceAccessControl).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      expect.objectContaining({ roleCodes: [] })
    );
  });
});
