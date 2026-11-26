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

import { MembersService } from './members.service';

/**
 * Self-service sign-up (anonymous POST /v1/participants-request/member, job-board sign-up, and
 * the logged-in legacy POST /v1/participants-request) must not self-assert isVerified.
 */
describe('createMemberFromSignUpData — self-service sign-up hardening', () => {
  it('drops client-supplied isVerified before building the member', async () => {
    const tx = {};
    const service: any = Object.create(MembersService.prototype);
    Object.assign(service, {
      prisma: { $transaction: jest.fn((fn) => fn(tx)) },
      prepareMemberFromParticipantRequest: jest.fn().mockResolvedValue({ member: {} }),
      mapLocationToMember: jest.fn().mockResolvedValue(undefined),
      createMember: jest.fn().mockResolvedValue({ uid: 'm1' }),
      membersHooksService: { postCreateActions: jest.fn().mockResolvedValue(undefined) },
    });
    const input = { name: 'Jane Smith', email: 'jane@example.com', isVerified: true };
    await service.createMemberFromSignUpData(input);
    const dto = service.prepareMemberFromParticipantRequest.mock.calls[0][1];
    expect(dto).not.toHaveProperty('isVerified');
    expect(dto.email).toBe('jane@example.com');
    expect(input.isVerified).toBe(true); // caller's object is not mutated
  });
});

/**
 * Joining an existing team through anonymous sign-up must not make the joiner its lead.
 */
describe('createMemberAndAttach — anonymous sign-up hardening', () => {
  function setup() {
    const tx = {
      member: { update: jest.fn().mockResolvedValue({}) },
      team: { create: jest.fn().mockResolvedValue({ uid: 'new-team' }) },
      teamMemberRole: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const service: any = Object.create(MembersService.prototype);
    Object.assign(service, {
      logger: { info: jest.fn() },
      prisma: { $transaction: jest.fn((fn) => fn(tx)) },
      teamService: { findTeamByUid: jest.fn().mockResolvedValue({ uid: 'existing-team' }), findTeamByName: jest.fn() },
      createMemberFromSignUpData: jest.fn().mockResolvedValue({ uid: 'm1' }),
      attachProjectTx: jest.fn().mockResolvedValue(undefined),
    });
    return { service, tx };
  }

  it('joins an existing team as a non-lead', async () => {
    const { service, tx } = setup();
    await service.createMemberAndAttach(
      { name: 'Jane Smith', email: 'jane@example.com' },
      { team: { uid: 'existing-team' } }
    );
    expect(tx.teamMemberRole.upsert.mock.calls[0][0].create).toMatchObject({
      teamUid: 'existing-team',
      teamLead: false,
    });
  });

  it('makes the creator of a new team its lead', async () => {
    const { service, tx } = setup();
    await service.createMemberAndAttach(
      { name: 'Jane Smith', email: 'jane@example.com' },
      { team: { name: 'Acme Capital' }, isTeamNew: true }
    );
    expect(tx.teamMemberRole.upsert.mock.calls[0][0].create).toMatchObject({ teamUid: 'new-team', teamLead: true });
  });
});
