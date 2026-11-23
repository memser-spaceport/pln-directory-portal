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

import { ForbiddenException } from '@nestjs/common';

import { TeamsService } from './teams.service';

/** `updateTeamFromParticipantsRequest` authorizes the path team, so body roles must stay on that team. */
describe('TeamsService — teamMemberRoles must belong to the path team', () => {
  function setup() {
    const prisma = { $transaction: jest.fn() };
    const service = Object.create(TeamsService.prototype);
    Object.assign(service, {
      prisma,
      logger: { info: jest.fn(), error: jest.fn() },
      membersService: { findMemberByEmail: jest.fn().mockResolvedValue({}) },
    });
    return { service: service as TeamsService, prisma };
  }

  const request = (status: string, teamUid: string) =>
    ({ newData: { name: 'Acme', teamMemberRoles: [{ status, memberUid: 'm1', teamUid }] } } as any);

  // A Delete row without teamUid used to reach deleteMany with an undefined team filter.
  it.each([
    ['Add', 'team-y'],
    ['Add', undefined],
    ['Update', 'team-y'],
    ['Delete', 'team-y'],
    ['Delete', undefined],
  ])('refuses a %s row for teamUid=%s when updating team-x', async (status, teamUid) => {
    const { service, prisma } = setup();

    await expect(
      service.updateTeamFromParticipantsRequest('team-x', request(status, teamUid as string), 'lead@example.com')
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ignores untouched rows (no status) from other teams, which the update loop skips', async () => {
    const { service, prisma } = setup();
    const untouched = { newData: { name: 'Acme', teamMemberRoles: [{ memberUid: 'm2', teamUid: 'team-y' }] } } as any;

    await service.updateTeamFromParticipantsRequest('team-x', untouched, 'lead@example.com').catch(() => undefined);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
