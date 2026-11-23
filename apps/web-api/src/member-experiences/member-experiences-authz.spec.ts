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
import { MemberRole } from '../utils/constants';

import { MemberExperiencesController } from './member-experiences.controller';
import { MemberExperiencesService } from './member-experiences.service';

/** Only the owning member (the requester) or a directory admin may create, update or delete an experience. */
describe('member experiences — requester must be the member or a directory admin', () => {
  const owner = { uid: 'm1', memberRoles: [] };
  const admin = { uid: 'admin', memberRoles: [{ name: MemberRole.DIRECTORY_ADMIN }] };
  const stranger = { uid: 'm2', memberRoles: [] };

  function setup(requester: unknown) {
    const prisma = {
      memberExperience: {
        findUnique: jest.fn().mockResolvedValue({ uid: 'e1', memberUid: 'm1' }),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((fn) => fn({ memberExperience: { update: jest.fn().mockResolvedValue({}) } })),
    };
    const service: any = Object.create(MemberExperiencesService.prototype);
    Object.assign(service, {
      prisma,
      logger: { error: jest.fn() },
      cacheService: { reset: jest.fn() },
      membersService: { findMemberByEmail: jest.fn().mockResolvedValue(requester) },
    });
    // `any`: the same calls must also compile against the pre-fix signatures.
    return { service, controller: new MemberExperiencesController(service) as any, prisma };
  }

  const dto = { memberUid: 'm1', title: 't', company: 'c', startDate: new Date(), isCurrent: true } as any;
  const req = { userEmail: 'x@example.com' };

  it('refuses a stranger on create, update and remove', async () => {
    const { service, controller, prisma } = setup(stranger);
    await expect(controller.create(dto, req)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update('e1', { title: 'x' } as any, req.userEmail)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.remove({ params: { uid: 'e1' } } as any, req)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.memberExperience.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.memberExperience.delete).not.toHaveBeenCalled();
  });

  it.each([
    ['the member', owner],
    ['a directory admin', admin],
  ])('allows %s', async (_label, requester) => {
    const { service, controller, prisma } = setup(requester);
    await controller.create(dto, req);
    await service.update('e1', { title: 'x' } as any, req.userEmail);
    await controller.remove({ params: { uid: 'e1' } } as any, req);
    expect(prisma.memberExperience.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.memberExperience.delete).toHaveBeenCalledTimes(1);
  });
});
