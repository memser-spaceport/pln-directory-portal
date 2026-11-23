import { ForbiddenException } from '@nestjs/common';
import { MemberController } from './member.controller';

describe('MemberController role grants', () => {
  const memberService = {
    findMemberByUid: jest.fn().mockResolvedValue({ memberRoles: [{ name: 'DIRECTORY_ADMIN' }] }),
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
    expect(memberService.updateMemberRolesByUid).toHaveBeenCalledWith('u1', ['DIRECTORY_ADMIN', 'DEMO_DAY_ADMIN']);
  });

  it('lets a directory admin grant any role', async () => {
    await controller.updateMemberRoles(directoryAdminReq, 'u1', { roles: ['DIRECTORY_ADMIN'] });
    expect(memberService.updateMemberRolesByUid).toHaveBeenCalledWith('u1', ['DIRECTORY_ADMIN']);
  });
});
