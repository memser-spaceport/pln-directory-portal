import {
  extractSupersedingTwitterHandle,
  ScrapingDogTwitterProfile,
  TeamEnrichmentScrapingDogService,
  verifyTwitterProfileMatchesTeam,
} from './team-enrichment-scrapingdog.service';

/**
 * Unit-tests the small bits of `TeamEnrichmentScrapingDogService` that are
 * pure (handle extraction, payload normalization, not-found classification).
 * The HTTP path itself is exercised end-to-end by bench-judge.ts against
 * production fixtures — mocking `fetch` here would just re-implement the
 * happy path and miss the actual ScrapingDog response shape drift we care
 * about catching.
 */
describe('TeamEnrichmentScrapingDogService — X/Twitter profile', () => {
  // Service has no required injected deps — instantiate directly so we don't
  // drag in the Nest testing module (which has been flaky on this codebase's
  // jest config for plain-provider-only tests).
  const service = new TeamEnrichmentScrapingDogService();

  // Access the private methods we want to drive in isolation. The class isn't
  // designed for direct unit-testing of the normalize step, so we cast.
  const asAny = () => service as unknown as {
    extractTwitterHandle(handle: string): string | null;
    normalizeTwitterProfile(raw: Record<string, unknown>): ScrapingDogTwitterProfile;
    isNotFoundBody(raw: unknown): boolean;
  };

  describe('extractTwitterHandle', () => {
    it('strips @ from bare handle', () => {
      expect(asAny().extractTwitterHandle('@ScienceCorp_')).toBe('ScienceCorp_');
    });
    it('accepts a bare username unchanged', () => {
      expect(asAny().extractTwitterHandle('ScienceCorp_')).toBe('ScienceCorp_');
    });
    it('parses twitter.com URL', () => {
      expect(asAny().extractTwitterHandle('https://twitter.com/ScienceCorp_')).toBe('ScienceCorp_');
    });
    it('parses x.com URL with trailing path', () => {
      expect(asAny().extractTwitterHandle('https://x.com/ScienceCorp_/with_replies')).toBe('ScienceCorp_');
    });
    it('rejects handle with hyphen (X usernames are alphanumeric + underscore only)', () => {
      expect(asAny().extractTwitterHandle('acme-team')).toBeNull();
    });
    it('rejects handle longer than 15 chars (X cap)', () => {
      expect(asAny().extractTwitterHandle('aaaaaaaaaaaaaaaa')).toBeNull();
    });
    it('rejects empty / whitespace input', () => {
      expect(asAny().extractTwitterHandle('')).toBeNull();
      expect(asAny().extractTwitterHandle('   ')).toBeNull();
    });
  });

  describe('normalizeTwitterProfile', () => {
    // Canonical ScrapingDog response shape, captured from the docs example for
    // the ScienceCorp_ team (cldvnx75t01czu21k77n84pg2). Keep this fixture in
    // sync with the X endpoint's documented payload — if a key gets renamed
    // upstream we want this test to fail loudly.
    const scienceCorpRaw = {
      name: 'Science Corporation',
      username: '@ScienceCorp_',
      user_id: '1945671581759664128',
      description: 'Building a brighter tomorrow enabled by neural engineering',
      website: 'https://science.xyz/',
      verified: false,
      verified_type: 'Business',
      is_blue_verified: false,
    };

    it('returns canonical lowercased username without leading @', () => {
      const p = asAny().normalizeTwitterProfile(scienceCorpRaw);
      expect(p.username).toBe('sciencecorp_');
    });
    it('passes through name + website', () => {
      const p = asAny().normalizeTwitterProfile(scienceCorpRaw);
      expect(p.name).toBe('Science Corporation');
      expect(p.website).toBe('https://science.xyz/');
    });
    it('flags Business verified_type as a verified org', () => {
      const p = asAny().normalizeTwitterProfile(scienceCorpRaw);
      expect(p.isVerifiedOrg).toBe(true);
      expect(p.verifiedType).toBe('Business');
    });
    it('flags Government verified_type as a verified org', () => {
      const p = asAny().normalizeTwitterProfile({ ...scienceCorpRaw, verified_type: 'Government' });
      expect(p.isVerifiedOrg).toBe(true);
    });
    it('does NOT flag a missing verified_type as verified', () => {
      const p = asAny().normalizeTwitterProfile({ ...scienceCorpRaw, verified_type: null });
      expect(p.isVerifiedOrg).toBe(false);
    });
    it('rejects invalid website URLs', () => {
      const p = asAny().normalizeTwitterProfile({ ...scienceCorpRaw, website: 'not a url' });
      expect(p.website).toBeNull();
    });
  });

  describe('isNotFoundBody', () => {
    it('matches the documented not-found shape', () => {
      expect(asAny().isNotFoundBody({ success: false, message: 'Profile not found' })).toBe(true);
    });
    it('does not match success payloads', () => {
      expect(asAny().isNotFoundBody({ success: true, profile: {} })).toBe(false);
      expect(asAny().isNotFoundBody({ profile: {} })).toBe(false);
    });
  });
});

describe('verifyTwitterProfileMatchesTeam', () => {
  const mkProfile = (overrides: Partial<ScrapingDogTwitterProfile> = {}): ScrapingDogTwitterProfile => ({
    username: 'sciencecorp_',
    name: 'Science Corporation',
    description: null,
    website: 'https://science.xyz/',
    userId: '1',
    verifiedType: 'Business',
    isVerifiedOrg: true,
    ...overrides,
  });

  // The canonical failure case the doc + workflow are designed to fix.
  // Team "Science" (cldvnx75t01czu21k77n84pg2) had its AI-suggested
  // `twitterHandler = "ScienceCorp_"` flagged uncertain by the AI judge. With X
  // profile data on hand: website host == team.website host → auto-promoted.
  it('ScienceCorp_ canonical case: website host match → verified, single anchor', () => {
    const v = verifyTwitterProfileMatchesTeam(
      { name: 'Science', website: 'https://science.xyz' },
      mkProfile()
    );
    expect(v.verified).toBe(true);
    expect(v.anchors).toEqual(['website host match']);
  });

  it('website host match works regardless of www prefix and trailing slash', () => {
    const v = verifyTwitterProfileMatchesTeam(
      { name: 'Science', website: 'https://www.science.xyz/' },
      mkProfile({ website: 'https://science.xyz' })
    );
    expect(v.verified).toBe(true);
    expect(v.anchors).toEqual(['website host match']);
  });

  it('name match + X verified org → verified, two anchors', () => {
    // Team's website host differs from the X-listed website, but the X
    // account is Business-verified and the display name shares a substantive
    // token with the team name. Two anchors converge → verified.
    const v = verifyTwitterProfileMatchesTeam(
      { name: 'Acme Robotics', website: 'https://acme.com' },
      mkProfile({
        username: 'acmehq',
        name: 'Acme Robotics Inc',
        website: 'https://different-host.example',
        verifiedType: 'Business',
        isVerifiedOrg: true,
      })
    );
    expect(v.verified).toBe(true);
    expect(v.anchors).toEqual(['name match', 'x verified org']);
  });

  it('name match + handle prefix match → verified (no X-verified status needed)', () => {
    // Team Acme Robotics with twitter @acmehq. Handle starts with team token
    // "acme", and the profile name also matches. Two converging signals.
    const v = verifyTwitterProfileMatchesTeam(
      { name: 'Acme Robotics', website: 'https://acme.com' },
      mkProfile({
        username: 'acmehq',
        name: 'Acme Robotics',
        website: 'https://different-host.example',
        verifiedType: null,
        isVerifiedOrg: false,
      })
    );
    expect(v.verified).toBe(true);
    expect(v.anchors).toEqual(['name match', 'handle prefix match']);
  });

  it('name match alone (no second anchor) → NOT verified', () => {
    // Just a display-name overlap isn't enough — could be a brand-squatter or
    // unrelated account. Falls through to AI judge.
    const v = verifyTwitterProfileMatchesTeam(
      { name: 'Acme Robotics', website: 'https://acme.com' },
      mkProfile({
        username: 'unrelatedhandle',
        name: 'Acme Robotics Fan Page',
        website: 'https://different-host.example',
        verifiedType: null,
        isVerifiedOrg: false,
      })
    );
    expect(v.verified).toBe(false);
    expect(v.anchors).toEqual(['name match']);
  });

  it('no anchors fire → NOT verified', () => {
    const v = verifyTwitterProfileMatchesTeam(
      { name: 'Acme Robotics', website: 'https://acme.com' },
      mkProfile({
        username: 'totally_unrelated',
        name: 'Totally Unrelated Account',
        website: 'https://different-host.example',
        verifiedType: null,
        isVerifiedOrg: false,
      })
    );
    expect(v.verified).toBe(false);
    expect(v.anchors).toEqual([]);
  });

  it('handles team with no website', () => {
    // Team has no website on file. Website-host anchor can't fire. Verification
    // depends on the remaining two anchors.
    const v = verifyTwitterProfileMatchesTeam(
      { name: 'Acme Robotics', website: null },
      mkProfile({
        username: 'acmehq',
        name: 'Acme Robotics',
        website: 'https://acme.com',
        verifiedType: null,
        isVerifiedOrg: false,
      })
    );
    expect(v.verified).toBe(true);
    expect(v.anchors).toEqual(['name match', 'handle prefix match']);
  });
});

describe('extractSupersedingTwitterHandle', () => {
  // Canonical case the recovery path was designed around — clpr2ryag0002vg02fmgdd6ay
  // (human.tech, by Holonym). The user-supplied handle @0xHolonym still resolves
  // on X, but the X bio explicitly identifies the successor account.
  it('extracts handle from "old handle of @X" — the canonical Holonym case', () => {
    expect(
      extractSupersedingTwitterHandle('This is the old handle of @humntech', '0xHolonym')
    ).toEqual({ newHandle: 'humntech', pattern: 'old handle of' });
  });

  it('handles "old account of"', () => {
    expect(extractSupersedingTwitterHandle('Old account of @newco', 'oldco')).toEqual({
      newHandle: 'newco',
      pattern: 'old handle of',
    });
  });

  it('handles "moved to @X"', () => {
    expect(extractSupersedingTwitterHandle("We've moved to @newco — see you there!", 'oldco')).toEqual({
      newHandle: 'newco',
      pattern: 'moved to',
    });
  });

  it('handles "migrated to @X" / "switched to @X"', () => {
    expect(extractSupersedingTwitterHandle('Migrated to @newco', 'oldco')).toEqual({
      newHandle: 'newco',
      pattern: 'moved to',
    });
    expect(extractSupersedingTwitterHandle('Switched to @newco for updates', 'oldco')).toEqual({
      newHandle: 'newco',
      pattern: 'moved to',
    });
  });

  it('handles "rebranded to @X" / "renamed as @X"', () => {
    expect(extractSupersedingTwitterHandle('Rebranded to @newco in 2024', 'oldco')).toEqual({
      newHandle: 'newco',
      pattern: 'rebranded to',
    });
    expect(extractSupersedingTwitterHandle('Renamed as @newco', 'oldco')).toEqual({
      newHandle: 'newco',
      pattern: 'rebranded to',
    });
  });

  it('handles "new account is @X" / "main handle is @X"', () => {
    expect(extractSupersedingTwitterHandle('Our new account is @newco', 'oldco')).toEqual({
      newHandle: 'newco',
      pattern: 'new account is',
    });
    expect(extractSupersedingTwitterHandle('Main handle: @newco', 'oldco')).toEqual({
      newHandle: 'newco',
      pattern: 'new account is',
    });
  });

  it('handles "follow us at @X"', () => {
    expect(extractSupersedingTwitterHandle('Inactive. Follow us at @newco', 'oldco')).toEqual({
      newHandle: 'newco',
      pattern: 'follow us at',
    });
  });

  it('lowercases the extracted handle (X usernames are case-insensitive)', () => {
    expect(extractSupersedingTwitterHandle('Old handle of @HumnTech', '0xholonym')).toEqual({
      newHandle: 'humntech',
      pattern: 'old handle of',
    });
  });

  it('returns null when the matched handle equals the current handle', () => {
    // A description that mentions its own handle isn't superseding itself.
    expect(
      extractSupersedingTwitterHandle('We are @humntech, formerly known as the old handle of @humntech', 'humntech')
    ).toBeNull();
  });

  it('returns null on empty / missing description', () => {
    expect(extractSupersedingTwitterHandle(null, 'oldco')).toBeNull();
    expect(extractSupersedingTwitterHandle(undefined, 'oldco')).toBeNull();
    expect(extractSupersedingTwitterHandle('', 'oldco')).toBeNull();
  });

  it('does NOT match generic "follow @X" mentions', () => {
    // Avoid silently rebinding to whatever handle the bio mentions.
    expect(extractSupersedingTwitterHandle('Follow @ourpartners for updates', 'oldco')).toBeNull();
    expect(extractSupersedingTwitterHandle('Big shoutout to @anotherteam', 'oldco')).toBeNull();
  });

  it('does NOT match "now hiring @recruiter" (verb between "now" and @ blocks it)', () => {
    // The pattern set intentionally omits a bare "now @X" — too risky.
    expect(extractSupersedingTwitterHandle('We are now hiring — apply to @recruiter', 'oldco')).toBeNull();
  });

  it('does NOT match mid-word substrings or hyphen-extended handles', () => {
    // X handles are alphanumeric + underscore; the regex stops at the first
    // non-handle char so "@oldco-team" extracts "oldco" but the equality
    // guard against the current handle drops it.
    expect(
      extractSupersedingTwitterHandle('Old handle of @oldco-team', 'oldco')
    ).toBeNull();
  });
});
