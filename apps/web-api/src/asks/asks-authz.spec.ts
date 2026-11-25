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
import { AskStatus } from '@prisma/client';

import { AskService } from './asks.service';

/** Asks owned by a project (no team) must get the same membership-or-admin check as team asks. */
describe('AskService — project-owned asks require a project member or admin', () => {
  const projectAsk = { uid: 'ask-1', status: AskStatus.OPEN, team: null, projectUid: 'p1' };
  const project = { createdBy: 'creator', maintainingTeamUid: 't1', contributingTeams: [{ uid: 't2' }] };

  function setup(requester: any, { admin = false, partOfTeam = false } = {}) {
    const ask = { update: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({}) };
    const service: any = Object.create(AskService.prototype);
    Object.assign(service, {
      prisma: { ask, project: { findUnique: jest.fn().mockResolvedValue(project) } },
      logger: { error: jest.fn() },
      findOne: jest.fn().mockResolvedValue(projectAsk),
      notifyForAskStatusChange: jest.fn(),
      membersService: {
        findMemberByEmail: jest.fn().mockResolvedValue(requester),
        checkIfAdminUser: jest.fn().mockReturnValue(admin),
        isMemberPartOfTeams: jest.fn().mockReturnValue(partOfTeam),
      },
    });
    return { service: service as AskService, ask };
  }

  it('refuses update and delete by an unrelated member', async () => {
    const { service, ask } = setup({ uid: 'outsider' });
    await expect(service.update('ask-1', 'o@example.com', { title: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.delete('ask-1', 'o@example.com')).rejects.toBeInstanceOf(ForbiddenException);
    expect(ask.update).not.toHaveBeenCalled();
    expect(ask.delete).not.toHaveBeenCalled();
  });

  it('allows a member of a project team to update and delete', async () => {
    const { service, ask } = setup({ uid: 'm1' }, { partOfTeam: true });
    await service.update('ask-1', 'm@example.com', { title: 'x' });
    await service.delete('ask-1', 'm@example.com');
    expect(ask.update).toHaveBeenCalledTimes(1);
    expect(ask.delete).toHaveBeenCalledTimes(1);
  });

  it('allows the project creator and a directory admin', async () => {
    const creator = setup({ uid: 'creator' });
    await creator.service.update('ask-1', 'c@example.com', { title: 'x' });
    expect(creator.ask.update).toHaveBeenCalledTimes(1);
    const admin = setup({ uid: 'admin' }, { admin: true });
    await admin.service.update('ask-1', 'a@example.com', { title: 'x' });
    expect(admin.ask.update).toHaveBeenCalledTimes(1);
  });

  it('records the requester, not the body uid, as closer', async () => {
    const { service, ask } = setup({ uid: 'm1' }, { partOfTeam: true });
    await service.update('ask-1', 'm@example.com', { status: AskStatus.CLOSED, closedByUid: 'someone-else' });
    expect(ask.update.mock.calls[0][0].data.closedBy).toEqual({ connect: { uid: 'm1' } });
  });
});
