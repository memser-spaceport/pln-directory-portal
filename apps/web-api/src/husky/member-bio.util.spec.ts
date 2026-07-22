// The `ai` / `@ai-sdk/openai` packages ship untranspiled ESM that this jest
// config can't parse; the functions under test never reach them, so stub the
// module boundary instead of widening transformIgnorePatterns for everyone.
jest.mock('ai', () => ({ generateText: jest.fn() }));
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { responses: jest.fn(), tools: { webSearchPreview: jest.fn() } }),
}));

import { PrismaClient } from '@prisma/client';
import {
  buildMemberBioPrompt,
  mapGenderToPronouns,
  resolveMemberPronouns,
  scanTextForExplicitPronouns,
} from './member-bio.util';

/**
 * Unit-tests the pure pronoun-resolution and prompt-building pieces of the
 * member bio generation. The generateText path itself is exercised manually
 * (it is a paid OpenAI call) — the defect these tests guard against is the
 * pronoun ladder silently regressing back to "guess from the name".
 */

const baseMember = {
  uid: 'uid-1',
  name: 'Sam Doe',
  email: 'sam@example.com',
  githubHandler: null,
  linkedinHandler: null,
  twitterHandler: null,
  discordHandler: null,
  telegramHandler: null,
  location: null,
  moreDetails: null,
  linkedInDetails: null,
  skills: [],
  teamMemberRoles: [],
  projectContributions: [],
  experiences: [],
};

function fakePrisma(overrides: {
  masterProfile?: { affinityPersonId: string } | null;
  affinityByIdGender?: string | null;
  affinityByEmailGender?: string | null;
}): PrismaClient {
  return {
    masterProfile: {
      findFirst: jest.fn().mockResolvedValue(overrides.masterProfile ?? null),
    },
    affinityPerson: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides.affinityByIdGender ? { gender: overrides.affinityByIdGender } : null),
      findFirst: jest
        .fn()
        .mockResolvedValue(overrides.affinityByEmailGender ? { gender: overrides.affinityByEmailGender } : null),
    },
  } as unknown as PrismaClient;
}

describe('scanTextForExplicitPronouns', () => {
  it('detects a self-declared "(She/Her)" marker regardless of case', () => {
    expect(scanTextForExplicitPronouns('Jane Doe (She/Her) — CTO')).toBe('she/her');
  });

  it('detects "he/him" and "they/them" markers', () => {
    expect(scanTextForExplicitPronouns('John (he/him)')).toBe('he/him');
    expect(scanTextForExplicitPronouns('Alex • they/them • builder')).toBe('they/them');
  });

  it('detects a "pronouns: she" declaration', () => {
    expect(scanTextForExplicitPronouns('pronouns: she, based in NYC')).toBe('she/her');
  });

  it('returns the earliest marker when several appear (e.g. "she/her" before "they/them")', () => {
    expect(scanTextForExplicitPronouns('she/her they/them')).toBe('she/her');
  });

  it('does NOT match prose that merely uses gendered pronouns', () => {
    expect(scanTextForExplicitPronouns('She leads the team and he supports her work.')).toBeNull();
  });

  it('finds markers inside a JSON blob (linkedInDetails scan path)', () => {
    expect(scanTextForExplicitPronouns(JSON.stringify({ fullName: 'Jane Doe (she/her)' }))).toBe('she/her');
  });

  it('returns null for empty input', () => {
    expect(scanTextForExplicitPronouns('')).toBeNull();
    expect(scanTextForExplicitPronouns(null)).toBeNull();
    expect(scanTextForExplicitPronouns(undefined)).toBeNull();
  });
});

describe('mapGenderToPronouns', () => {
  it('maps female/male/non-binary CRM values', () => {
    expect(mapGenderToPronouns('Female')).toBe('she/her');
    expect(mapGenderToPronouns('MALE')).toBe('he/him');
    expect(mapGenderToPronouns('Non-binary')).toBe('they/them');
  });

  it('returns null for inconclusive values instead of guessing', () => {
    expect(mapGenderToPronouns('Unknown')).toBeNull();
    expect(mapGenderToPronouns('Prefer not to say')).toBeNull();
    expect(mapGenderToPronouns('')).toBeNull();
    expect(mapGenderToPronouns(null)).toBeNull();
  });
});

describe('resolveMemberPronouns', () => {
  it('prefers explicit pronouns in stored linkedInDetails over CRM gender', async () => {
    const member = { ...baseMember, linkedInDetails: { headline: 'CTO (she/her)' } };
    const prisma = fakePrisma({ affinityByEmailGender: 'Male' });
    const result = await resolveMemberPronouns(prisma, member);
    expect(result).toEqual({ pronouns: 'she/her', source: 'linkedin details on file' });
  });

  it('falls back to AffinityPerson gender linked via MasterProfile', async () => {
    const prisma = fakePrisma({ masterProfile: { affinityPersonId: 'ap-1' }, affinityByIdGender: 'Female' });
    const result = await resolveMemberPronouns(prisma, baseMember);
    expect(result).toEqual({ pronouns: 'she/her', source: 'CRM gender record' });
  });

  it('falls back to AffinityPerson gender matched by email', async () => {
    const prisma = fakePrisma({ affinityByEmailGender: 'Male' });
    const result = await resolveMemberPronouns(prisma, baseMember);
    expect(result).toEqual({ pronouns: 'he/him', source: 'CRM gender record' });
  });

  it('returns null (no guessing) when no signal is conclusive', async () => {
    const prisma = fakePrisma({ affinityByEmailGender: 'Unknown' });
    const result = await resolveMemberPronouns(prisma, baseMember);
    expect(result).toBeNull();
  });
});

describe('buildMemberBioPrompt', () => {
  it('states verified pronouns and their source', () => {
    const prompt = buildMemberBioPrompt(baseMember, {
      pronouns: { pronouns: 'she/her', source: 'CRM gender record' },
    });
    expect(prompt).toContain('Known Pronouns: she/her (verified via CRM gender record)');
  });

  it('forbids guessing when pronouns are unknown and asks for pronoun-free phrasing', () => {
    const prompt = buildMemberBioPrompt(baseMember, {});
    expect(prompt).toContain('Known Pronouns: unknown — do NOT guess');
    expect(prompt).toContain('avoid third-person pronouns entirely');
  });

  it('appends scraped context as authoritative when provided', () => {
    const prompt = buildMemberBioPrompt(baseMember, { scrapedContext: '- X profile (@sam): builder' });
    expect(prompt).toContain('- X profile (@sam): builder');
    expect(prompt).toContain('authoritative');
  });

  it('omits the scraped context section when absent', () => {
    const prompt = buildMemberBioPrompt(baseMember, {});
    expect(prompt).not.toContain('authoritative');
  });
});
