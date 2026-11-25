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

import { TeamsService } from './teams.service';

/** `addEditTeamAsk` is authorized for the path team, so the ask it edits must belong to that team. */
describe('TeamsService.addEditTeamAsk — ask must belong to the path team', () => {
  function setup(ownedAsk: unknown) {
    const ask = {
      findFirst: jest.fn().mockResolvedValue(ownedAsk),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    };
    const prisma: any = { ask };
    prisma.$transaction = jest.fn((fn) => fn({ ask }));
    const service: any = Object.create(TeamsService.prototype);
    Object.assign(service, {
      prisma,
      cacheService: { reset: jest.fn() },
      forestadminService: { triggerAirtableSync: jest.fn() },
    });
    return { service: service as TeamsService, ask };
  }

  it('refuses to update an ask of another team', async () => {
    const { service, ask } = setup(null);
    await expect(
      service.addEditTeamAsk('t1', 'Acme', 'a@example.com', { uid: 'ask-y', title: 'x' })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ask.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { uid: 'ask-y', teamUid: 't1' } }));
    expect(ask.update).not.toHaveBeenCalled();
  });

  it('refuses to delete an ask of another team', async () => {
    const { service, ask } = setup(null);
    await expect(
      service.addEditTeamAsk('t1', 'Acme', 'a@example.com', { uid: 'ask-y', isDeleted: true })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ask.delete).not.toHaveBeenCalled();
  });

  it('does not let the body move an owned ask to another team or project', async () => {
    const { service, ask } = setup({ uid: 'ask-x' });
    await service.addEditTeamAsk('t1', 'Acme', 'a@example.com', {
      uid: 'ask-x',
      title: 'x',
      teamUid: 't9',
      projectUid: 'p9',
    });
    expect(ask.update).toHaveBeenCalledWith({ where: { uid: 'ask-x' }, data: { title: 'x', closedAt: null } });
  });

  it('binds a new ask to the path team even if the body names another', async () => {
    const { service, ask } = setup(null);
    await service.addEditTeamAsk('t1', 'Acme', 'a@example.com', { title: 'x', teamUid: 't9', projectUid: 'p9' });
    expect(ask.create).toHaveBeenCalledWith({ data: { title: 'x', teamUid: 't1' } });
  });
});
