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
