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

import { ProjectsService } from './projects.service';

/** `addEditProjectAsk` authorizes the path project, so the ask it edits must belong to that project. */
describe('ProjectsService.addEditProjectAsk — ask must belong to the path project', () => {
  function setup(ownedAsk: unknown) {
    const ask = {
      findFirst: jest.fn().mockResolvedValue(ownedAsk),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    };
    const service: any = Object.create(ProjectsService.prototype);
    Object.assign(service, {
      prisma: { ask },
      memberService: { findMemberByEmail: jest.fn().mockResolvedValue({ uid: 'm1' }) },
      cacheService: { reset: jest.fn() },
      getProjectByUid: jest.fn().mockResolvedValue({ maintainingTeamUid: 't1', contributingTeams: [] }),
      isMemberAllowedToEdit: jest.fn().mockResolvedValue(true),
    });
    return { service: service as ProjectsService, ask };
  }

  it('refuses to update an ask of another project', async () => {
    const { service, ask } = setup(null);
    await expect(service.addEditProjectAsk('p1', 'a@example.com', { uid: 'ask-y', title: 'x' })).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(ask.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { uid: 'ask-y', projectUid: 'p1' } }));
    expect(ask.update).not.toHaveBeenCalled();
  });

  it('refuses to delete an ask of another project', async () => {
    const { service, ask } = setup(null);
    await expect(
      service.addEditProjectAsk('p1', 'a@example.com', { uid: 'ask-y', isDeleted: true })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(ask.delete).not.toHaveBeenCalled();
  });

  it('does not let the body move an owned ask to another project or team', async () => {
    const { service, ask } = setup({ uid: 'ask-x' });
    await service.addEditProjectAsk('p1', 'a@example.com', {
      uid: 'ask-x',
      title: 'x',
      projectUid: 'p2',
      teamUid: 't9',
    });
    expect(ask.update).toHaveBeenCalledWith({ where: { uid: 'ask-x' }, data: { title: 'x' } });
  });

  it('binds a new ask to the path project even if the body names another', async () => {
    const { service, ask } = setup(null);
    await service.addEditProjectAsk('p1', 'a@example.com', { title: 'x', projectUid: 'p2', teamUid: 't9' });
    expect(ask.create).toHaveBeenCalledWith({ data: { title: 'x', projectUid: 'p1' } });
  });
});
