// The `ai` / `@ai-sdk/*` packages ship untranspiled ESM that this jest config
// can't parse. HuskyGenerationService imports `generateText` from 'ai' at
// module scope, and this spec needs the real class import (not `import type`)
// so NestJS's design:paramtypes metadata still resolves correctly at runtime —
// so stub the module boundary instead, same pattern as member-bio.util.spec.ts.
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { responses: jest.fn(), tools: { webSearchPreview: jest.fn() } }),
}));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));

import type { PrismaService } from '../shared/prisma.service';
import type { MemberScrapingDogService } from '../husky/member-scrapingdog.service';
import type { HuskyGenerationService } from '../husky/husky-generation.service';
import type { MemberEnrichmentAiService } from './member-enrichment-ai.service';
import { MemberEnrichmentService } from './member-enrichment.service';
import { generateMemberBioText, resolveMemberPronouns } from '../husky/member-bio.util';
import { matchTeamFromCompanyName } from './member-enrichment-team-match.util';
import { EnrichmentStatus, FieldEnrichmentStatus } from './member-enrichment.types';

jest.mock('../husky/member-bio.util', () => ({
  generateMemberBioText: jest.fn(),
  resolveMemberPronouns: jest.fn(),
}));
jest.mock('./member-enrichment-team-match.util', () => ({
  matchTeamFromCompanyName: jest.fn(),
}));

const mockedGenerateMemberBioText = generateMemberBioText as jest.Mock;
const mockedResolveMemberPronouns = resolveMemberPronouns as jest.Mock;
const mockedMatchTeamFromCompanyName = matchTeamFromCompanyName as jest.Mock;

function buildMember(overrides: Partial<any> = {}) {
  return {
    uid: 'member-1',
    name: 'Jane Doe',
    email: null,
    bio: null,
    moreDetails: null,
    linkedInDetails: null,
    linkedinHandler: 'jane-doe',
    twitterHandler: null,
    githubHandler: null,
    discordHandler: null,
    telegramHandler: null,
    blueskyHandler: null,
    isInvestor: true,
    skills: [],
    teamMemberRoles: [],
    projectContributions: [],
    experiences: [],
    location: null,
    ...overrides,
  };
}

function buildPrismaMock(member: any) {
  return {
    member: {
      findUnique: jest.fn().mockResolvedValue(member),
      update: jest.fn().mockResolvedValue(member),
      findMany: jest.fn().mockResolvedValue([]),
    },
    memberEnrichment: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(0),
    },
    masterProfile: { findFirst: jest.fn().mockResolvedValue(null) },
    affinityPerson: { findUnique: jest.fn().mockResolvedValue(null) },
    teamMemberRole: { update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({}) },
    memberExperience: { create: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
}

function buildScrapingDogMock(overrides: Partial<any> = {}) {
  return {
    isConfigured: jest.fn().mockReturnValue(true),
    fetchPersonProfile: jest.fn().mockResolvedValue({ kind: 'error', reason: 'not called' }),
    fetchXProfile: jest.fn().mockResolvedValue({ kind: 'error', reason: 'not called' }),
    ...overrides,
  };
}

function buildHuskyMock(overrides: Partial<any> = {}) {
  return { generateMemberSkills: jest.fn().mockResolvedValue({ skills: [] }), ...overrides };
}

function buildMemberEnrichmentAiMock(overrides: Partial<any> = {}) {
  return { findBlueskyHandle: jest.fn().mockResolvedValue({ handle: null }), ...overrides };
}

describe('MemberEnrichmentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedResolveMemberPronouns.mockResolvedValue(null);
    mockedGenerateMemberBioText.mockResolvedValue('');
    mockedMatchTeamFromCompanyName.mockResolvedValue(null);
  });

  describe('doEnrichMember (private, invoked directly for deterministic assertions)', () => {
    it('fetches ScrapingDog exactly once, preferring LinkedIn over X', async () => {
      const member = buildMember({ linkedinHandler: 'jane-doe', twitterHandler: 'janedoe', bio: 'existing bio' });
      const prisma = buildPrismaMock(member);
      const scrapingDog = buildScrapingDogMock({
        fetchPersonProfile: jest.fn().mockResolvedValue({
          kind: 'ok',
          profile: {
            fullName: 'Jane Doe',
            headline: null,
            about: null,
            location: null,
            experiences: [],
            education: [],
          },
        }),
      });
      const husky = buildHuskyMock();
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        scrapingDog as unknown as MemberScrapingDogService,
        husky as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(scrapingDog.fetchPersonProfile).toHaveBeenCalledTimes(1);
      expect(scrapingDog.fetchXProfile).not.toHaveBeenCalled();
    });

    it('falls back to X only when there is no LinkedIn handle', async () => {
      const member = buildMember({ linkedinHandler: null, twitterHandler: 'janedoe', bio: 'existing bio' });
      const prisma = buildPrismaMock(member);
      const scrapingDog = buildScrapingDogMock({
        fetchXProfile: jest
          .fn()
          .mockResolvedValue({ kind: 'ok', profile: { username: 'janedoe', name: 'Jane', description: null } }),
      });
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        scrapingDog as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(scrapingDog.fetchPersonProfile).not.toHaveBeenCalled();
      expect(scrapingDog.fetchXProfile).toHaveBeenCalledTimes(1);
    });

    it('never overwrites a pre-existing bio/email/skills and stamps them ChangedByUser', async () => {
      const member = buildMember({
        bio: 'already has a bio',
        email: 'jane@example.com',
        skills: [{ uid: 'skill-1', title: 'Rust' }],
        teamMemberRoles: [
          {
            teamUid: 'team-1',
            mainTeam: true,
            role: 'Engineer',
            teamLead: false,
            team: { uid: 'team-1', name: 'Acme' },
          },
        ],
      });
      const prisma = buildPrismaMock(member);
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        buildScrapingDogMock({ isConfigured: jest.fn().mockReturnValue(false) }) as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(prisma.member.update).not.toHaveBeenCalled();
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      const fieldsMeta = savedMeta.update.dataEnrichment.fieldsMeta;
      expect(fieldsMeta.bio.status).toBe(FieldEnrichmentStatus.ChangedByUser);
      expect(fieldsMeta.email.status).toBe(FieldEnrichmentStatus.ChangedByUser);
      expect(fieldsMeta.skills.status).toBe(FieldEnrichmentStatus.ChangedByUser);
      expect(fieldsMeta.primaryTeamRole.status).toBe(FieldEnrichmentStatus.ChangedByUser);
      expect(savedMeta.update.dataEnrichment.status).toBe(EnrichmentStatus.Enriched);
    });

    it('creates a new TeamMemberRole when the matched team has no existing row for this member', async () => {
      const member = buildMember({
        linkedinHandler: 'jane-doe',
        bio: 'existing bio',
        email: 'jane@example.com',
        skills: [{ uid: 's1', title: 'X' }],
      });
      const prisma = buildPrismaMock(member);
      const scrapingDog = buildScrapingDogMock({
        fetchPersonProfile: jest.fn().mockResolvedValue({
          kind: 'ok',
          profile: {
            fullName: 'Jane Doe',
            headline: null,
            about: null,
            location: null,
            education: [],
            experiences: [{ title: 'CTO', company: 'Acme Robotics', location: null, duration: null, summary: null }],
          },
        }),
      });
      mockedMatchTeamFromCompanyName.mockResolvedValue({ uid: 'team-99', name: 'Acme Robotics' });
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        scrapingDog as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(prisma.teamMemberRole.create).toHaveBeenCalledWith({
        data: { memberUid: member.uid, teamUid: 'team-99', mainTeam: true, role: 'CTO' },
      });
      expect(prisma.teamMemberRole.update).not.toHaveBeenCalled();
    });

    it('flips mainTeam on an existing TeamMemberRole instead of creating a duplicate', async () => {
      const member = buildMember({
        linkedinHandler: 'jane-doe',
        bio: 'existing bio',
        email: 'jane@example.com',
        skills: [{ uid: 's1', title: 'X' }],
        teamMemberRoles: [
          {
            teamUid: 'team-99',
            mainTeam: false,
            role: null,
            teamLead: false,
            team: { uid: 'team-99', name: 'Acme Robotics' },
          },
        ],
      });
      const prisma = buildPrismaMock(member);
      const scrapingDog = buildScrapingDogMock({
        fetchPersonProfile: jest.fn().mockResolvedValue({
          kind: 'ok',
          profile: {
            fullName: 'Jane Doe',
            headline: null,
            about: null,
            location: null,
            education: [],
            experiences: [{ title: 'CTO', company: 'Acme Robotics', location: null, duration: null, summary: null }],
          },
        }),
      });
      mockedMatchTeamFromCompanyName.mockResolvedValue({ uid: 'team-99', name: 'Acme Robotics' });
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        scrapingDog as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(prisma.teamMemberRole.create).not.toHaveBeenCalled();
      expect(prisma.teamMemberRole.update).toHaveBeenCalledWith({
        where: { memberUid_teamUid: { memberUid: member.uid, teamUid: 'team-99' } },
        data: { mainTeam: true, role: 'CTO' },
      });
    });

    it('marks primaryTeamRole CannotEnrich (and never creates a team) when no Directory team matches', async () => {
      const member = buildMember({
        linkedinHandler: 'jane-doe',
        bio: 'existing bio',
        email: 'jane@example.com',
        skills: [{ uid: 's1', title: 'X' }],
      });
      const prisma = buildPrismaMock(member);
      const scrapingDog = buildScrapingDogMock({
        fetchPersonProfile: jest.fn().mockResolvedValue({
          kind: 'ok',
          profile: {
            fullName: 'Jane Doe',
            headline: null,
            about: null,
            location: null,
            education: [],
            experiences: [
              { title: 'CTO', company: 'Totally Unmatched Co', location: null, duration: null, summary: null },
            ],
          },
        }),
      });
      mockedMatchTeamFromCompanyName.mockResolvedValue(null);
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        scrapingDog as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(prisma.teamMemberRole.create).not.toHaveBeenCalled();
      expect(prisma.teamMemberRole.update).not.toHaveBeenCalled();
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.primaryTeamRole.status).toBe(
        FieldEnrichmentStatus.CannotEnrich
      );
    });

    it('backfills MemberExperience from every parseable LinkedIn position when the member has none', async () => {
      const member = buildMember({
        linkedinHandler: 'jane-doe',
        bio: 'existing bio',
        email: 'jane@example.com',
        skills: [{ uid: 's1', title: 'X' }],
        experiences: [],
      });
      const prisma = buildPrismaMock(member);
      const scrapingDog = buildScrapingDogMock({
        fetchPersonProfile: jest.fn().mockResolvedValue({
          kind: 'ok',
          profile: {
            fullName: 'Jane Doe',
            headline: null,
            about: null,
            location: null,
            education: [],
            experiences: [
              {
                title: 'CTO',
                company: 'Acme Robotics',
                location: null,
                duration: null,
                summary: 'Ran engineering.',
                startsAt: 'Oct 2024',
                endsAt: 'Present',
              },
              {
                title: 'Engineer',
                company: 'Beta Corp',
                location: null,
                duration: null,
                summary: null,
                startsAt: null,
                endsAt: null,
              },
            ],
          },
        }),
      });
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        scrapingDog as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      // Only the entry with a parseable start date is inserted.
      expect(prisma.memberExperience.create).toHaveBeenCalledTimes(1);
      expect(prisma.memberExperience.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'CTO',
          company: 'Acme Robotics',
          isCurrent: true,
          endDate: null,
          memberUid: member.uid,
        }),
      });
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.workHistory.status).toBe(FieldEnrichmentStatus.Enriched);
    });

    it('adds only the LinkedIn positions missing from an existing partial history, leaving the existing row untouched', async () => {
      const member = buildMember({
        linkedinHandler: 'jane-doe',
        bio: 'existing bio',
        email: 'jane@example.com',
        skills: [{ uid: 's1', title: 'X' }],
        experiences: [{ uid: 'exp-1', title: 'Old role', company: 'Old Co' }],
      });
      const prisma = buildPrismaMock(member);
      const scrapingDog = buildScrapingDogMock({
        fetchPersonProfile: jest.fn().mockResolvedValue({
          kind: 'ok',
          profile: {
            fullName: 'Jane Doe',
            headline: null,
            about: null,
            location: null,
            education: [],
            experiences: [
              // Already on file (by company name) — must not be re-inserted or touched.
              { title: 'Old role', company: 'Old Co', location: null, duration: null, summary: null, startsAt: 'Jan 2018', endsAt: 'Dec 2020' },
              // A genuine gap — the member never entered this one.
              { title: 'CTO', company: 'Acme Robotics', location: null, duration: null, summary: null, startsAt: 'Oct 2024', endsAt: 'Present' },
            ],
          },
        }),
      });
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        scrapingDog as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(prisma.memberExperience.create).toHaveBeenCalledTimes(1);
      expect(prisma.memberExperience.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ company: 'Acme Robotics', title: 'CTO' }),
      });
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.workHistory).toMatchObject({
        status: FieldEnrichmentStatus.Enriched,
        note: expect.stringContaining('1'),
      });
    });

    it('stamps workHistory as already covered when every LinkedIn position matches an existing row by company', async () => {
      const member = buildMember({
        linkedinHandler: 'jane-doe',
        bio: 'existing bio',
        email: 'jane@example.com',
        skills: [{ uid: 's1', title: 'X' }],
        experiences: [{ uid: 'exp-1', title: 'CTO', company: 'Acme Robotics' }],
      });
      const prisma = buildPrismaMock(member);
      const scrapingDog = buildScrapingDogMock({
        fetchPersonProfile: jest.fn().mockResolvedValue({
          kind: 'ok',
          profile: {
            fullName: 'Jane Doe',
            headline: null,
            about: null,
            location: null,
            education: [],
            experiences: [
              { title: 'CTO', company: 'Acme Robotics', location: null, duration: null, summary: null, startsAt: 'Oct 2024', endsAt: 'Present' },
            ],
          },
        }),
      });
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        scrapingDog as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(prisma.memberExperience.create).not.toHaveBeenCalled();
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.workHistory.status).toBe(FieldEnrichmentStatus.ChangedByUser);
    });

    it('marks workHistory CannotEnrich when there is no usable LinkedIn experience data', async () => {
      const member = buildMember({
        bio: 'existing bio',
        email: 'jane@example.com',
        skills: [{ uid: 's1', title: 'X' }],
        experiences: [],
      });
      const prisma = buildPrismaMock(member);
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        buildScrapingDogMock({ isConfigured: jest.fn().mockReturnValue(false) }) as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(prisma.memberExperience.create).not.toHaveBeenCalled();
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.workHistory.status).toBe(FieldEnrichmentStatus.CannotEnrich);
    });

    it('fills email from AffinityPerson via MasterProfile when missing, and skips on a conflicting existing member', async () => {
      const member = buildMember({ email: null, bio: 'x', skills: [{ uid: 's1', title: 'X' }] });
      const prisma = buildPrismaMock(member);
      prisma.masterProfile.findFirst.mockResolvedValue({ affinityPersonId: 'affinity-1' });
      prisma.affinityPerson.findUnique.mockResolvedValue({ primaryEmail: 'jane@crm.example.com' });
      prisma.member.findUnique
        .mockResolvedValueOnce(member) // doEnrichMember's own fetch
        .mockResolvedValueOnce({ uid: 'someone-else' }); // conflict check inside tryFillEmail

      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        buildScrapingDogMock({ isConfigured: jest.fn().mockReturnValue(false) }) as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(prisma.member.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: expect.anything() }) })
      );
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.email.status).toBe(FieldEnrichmentStatus.CannotEnrich);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.email.note).toMatch(/already used/i);
    });

    it('only generates skills once an email exists (original or just-filled), and skips otherwise', async () => {
      const member = buildMember({ email: null, bio: 'x' });
      const prisma = buildPrismaMock(member);
      // No CRM email found -> email stays empty this run.
      const husky = buildHuskyMock();
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        buildScrapingDogMock({ isConfigured: jest.fn().mockReturnValue(false) }) as unknown as MemberScrapingDogService,
        husky as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(husky.generateMemberSkills).not.toHaveBeenCalled();
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.skills.status).toBe(FieldEnrichmentStatus.CannotEnrich);
    });

    it('stamps a pre-existing blueskyHandler as ChangedByUser without calling the AI fallback', async () => {
      const member = buildMember({ bio: 'x', email: 'jane@example.com', blueskyHandler: 'jane.bsky.social' });
      const prisma = buildPrismaMock(member);
      const ai = buildMemberEnrichmentAiMock();
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        buildScrapingDogMock({ isConfigured: jest.fn().mockReturnValue(false) }) as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        ai as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(ai.findBlueskyHandle).not.toHaveBeenCalled();
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.blueskyHandler.status).toBe(
        FieldEnrichmentStatus.ChangedByUser
      );
    });

    it('extracts blueskyHandler from the scraped LinkedIn about text without calling the AI fallback', async () => {
      const member = buildMember({ linkedinHandler: 'jane-doe', bio: 'x', email: 'jane@example.com' });
      const prisma = buildPrismaMock(member);
      const scrapingDog = buildScrapingDogMock({
        fetchPersonProfile: jest.fn().mockResolvedValue({
          kind: 'ok',
          profile: {
            fullName: 'Jane Doe',
            headline: null,
            about: 'Also on Bluesky: https://bsky.app/profile/jane.bsky.social',
            location: null,
            experiences: [],
            education: [],
          },
        }),
      });
      const ai = buildMemberEnrichmentAiMock();
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        scrapingDog as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        ai as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(ai.findBlueskyHandle).not.toHaveBeenCalled();
      expect(prisma.member.update).toHaveBeenCalledWith({
        where: { uid: member.uid },
        data: { blueskyHandler: 'jane.bsky.social' },
      });
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.blueskyHandler.status).toBe(FieldEnrichmentStatus.Enriched);
    });

    it('falls back to the AI web search when the scraped bio text has no Bluesky mention', async () => {
      const member = buildMember({ linkedinHandler: 'jane-doe', bio: 'x', email: 'jane@example.com' });
      const prisma = buildPrismaMock(member);
      const scrapingDog = buildScrapingDogMock({
        fetchPersonProfile: jest.fn().mockResolvedValue({
          kind: 'ok',
          profile: {
            fullName: 'Jane Doe',
            headline: null,
            about: 'No socials mentioned here.',
            location: null,
            experiences: [],
            education: [],
          },
        }),
      });
      const ai = buildMemberEnrichmentAiMock({
        findBlueskyHandle: jest.fn().mockResolvedValue({ handle: 'jane.bsky.social' }),
      });
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        scrapingDog as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        ai as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      expect(ai.findBlueskyHandle).toHaveBeenCalledTimes(1);
      expect(prisma.member.update).toHaveBeenCalledWith({
        where: { uid: member.uid },
        data: { blueskyHandler: 'jane.bsky.social' },
      });
      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.blueskyHandler.status).toBe(FieldEnrichmentStatus.Enriched);
    });

    it('marks blueskyHandler CannotEnrich when neither the bio scan nor the AI fallback find a handle', async () => {
      const member = buildMember({ bio: 'x', email: 'jane@example.com' });
      const prisma = buildPrismaMock(member);
      const ai = buildMemberEnrichmentAiMock();
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        buildScrapingDogMock({ isConfigured: jest.fn().mockReturnValue(false) }) as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        ai as unknown as MemberEnrichmentAiService
      );

      await (service as any).doEnrichMember(member.uid, 'test');

      const [savedMeta] = prisma.memberEnrichment.upsert.mock.calls.at(-1);
      expect(savedMeta.update.dataEnrichment.fieldsMeta.blueskyHandler.status).toBe(FieldEnrichmentStatus.CannotEnrich);
    });
  });

  describe('enrichMember', () => {
    it('skips when enrichment is already InProgress for this member', async () => {
      const member = buildMember();
      const prisma = buildPrismaMock(member);
      prisma.memberEnrichment.findUnique.mockResolvedValue({
        dataEnrichment: { status: EnrichmentStatus.InProgress, fieldsMeta: {} },
      });
      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        buildScrapingDogMock() as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );

      const result = await service.enrichMember(member.uid);
      expect(result).toEqual({ status: 'in_progress' });
    });
  });

  describe('markEligibleMembersForEnrichment', () => {
    it('marks founders/team-leads before everyone else', async () => {
      const prisma = buildPrismaMock(buildMember());
      prisma.member.findMany
        .mockResolvedValueOnce([{ uid: 'lead-1' }]) // founder/lead pass
        .mockResolvedValueOnce([{ uid: 'other-1' }]); // everyone-else pass

      const service = new MemberEnrichmentService(
        prisma as unknown as PrismaService,
        buildScrapingDogMock() as unknown as MemberScrapingDogService,
        buildHuskyMock() as unknown as HuskyGenerationService,
        buildMemberEnrichmentAiMock() as unknown as MemberEnrichmentAiService
      );
      const markSpy = jest.spyOn(service, 'markMemberForEnrichment').mockResolvedValue();

      const count = await service.markEligibleMembersForEnrichment();

      expect(count).toBe(2);
      expect(markSpy.mock.calls.map((c) => c[0])).toEqual(['lead-1', 'other-1']);
    });
  });
});
