import {
  CorroborationContext,
  corroborateBlog,
  corroborateContactMethod,
  corroborateLinkedinHandler,
  corroborateTelegramHandler,
  corroborateTwitterHandler,
  corroborateWebsite,
  namesShareSubstantiveToken,
  runCorroboration,
} from './team-enrichment-corroboration';
import { FieldConfidence, JudgmentSource, JudgmentVerdict } from './team-enrichment.types';

describe('team-enrichment-corroboration', () => {
  describe('contactMethod', () => {
    it("user's canonical failure case: email-domain == website-host → agrees+high", () => {
      const verdict = corroborateContactMethod('test@bestTeam.xyz', {
        teamName: 'Best Team',
        website: 'https://bestTeam.xyz',
      });
      expect(verdict).not.toBeNull();
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
      expect(verdict?.note).toBe('email domain matches website');
      expect(verdict?.judgedVia).toBe(JudgmentSource.Corroboration);
    });

    it('www. prefix on website still corroborates', () => {
      const verdict = corroborateContactMethod('hello@acme.com', {
        teamName: 'Acme',
        website: 'https://www.acme.com',
      });
      expect(verdict?.note).toBe('email domain matches website');
    });

    it('schemeless website is normalized and still matches', () => {
      const verdict = corroborateContactMethod('hello@acme.com', { teamName: 'Acme', website: 'acme.com' });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
    });

    it('subdomain email host vs root website host still corroborates (subdomain-of)', () => {
      const verdict = corroborateContactMethod('hello@mail.acme.com', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
    });

    it('falls back to JSON-LD contact email domain when website host differs', () => {
      const verdict = corroborateContactMethod('hello@acme.com', {
        teamName: 'Acme',
        website: 'https://acme.io',
        websiteSignals: { extractedAt: 'x', contactEmail: 'team@acme.com' },
      });
      expect(verdict?.note).toBe('email domain matches jsonld');
    });

    it('email with mismatching website and no JSON-LD → no verdict (falls through to AI)', () => {
      const verdict = corroborateContactMethod('contact@unrelated.org', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict).toBeNull();
    });

    it('non-email contactMethod (Discord invite) → no verdict (falls through)', () => {
      const verdict = corroborateContactMethod('https://discord.gg/xxxyyy', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict).toBeNull();
    });

    it('null or empty value → no verdict', () => {
      expect(corroborateContactMethod(null, { teamName: 'Acme' })).toBeNull();
      expect(corroborateContactMethod('', { teamName: 'Acme' })).toBeNull();
    });
  });

  describe('twitterHandler', () => {
    it('AI value equals website-self-declared twitter:site → agrees+high', () => {
      const verdict = corroborateTwitterHandler('acmehq', {
        teamName: 'Acme',
        websiteSignals: { extractedAt: 'x', twitterHandler: 'acmehq' },
      });
      expect(verdict?.note).toBe('website self declared');
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
    });

    it('@-prefix and case differences are normalized', () => {
      const verdict = corroborateTwitterHandler('@AcmeHQ', {
        teamName: 'Acme',
        websiteSignals: { extractedAt: 'x', twitterHandler: 'acmehq' },
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
    });

    it('value disagreeing with website-self-declared → no verdict (AI judges)', () => {
      const verdict = corroborateTwitterHandler('different', {
        teamName: 'Acme',
        websiteSignals: { extractedAt: 'x', twitterHandler: 'acmehq' },
      });
      expect(verdict).toBeNull();
    });

    it('no website signals → no verdict', () => {
      expect(corroborateTwitterHandler('acmehq', { teamName: 'Acme' })).toBeNull();
    });
  });

  describe('linkedinHandler', () => {
    it('AI value equals website-self-declared linkedin handle → agrees+high', () => {
      const verdict = corroborateLinkedinHandler('company/acme-labs', {
        teamName: 'Acme',
        websiteSignals: { extractedAt: 'x', linkedinHandler: 'company/acme-labs' },
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.note).toBe('website self declared');
    });

    it('full URL vs slug-only is normalized', () => {
      const verdict = corroborateLinkedinHandler('https://www.linkedin.com/company/acme-labs/', {
        teamName: 'Acme',
        websiteSignals: { extractedAt: 'x', linkedinHandler: 'company/acme-labs' },
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
    });
  });

  describe('telegramHandler', () => {
    it('AI value equals website-self-declared telegram → agrees+high', () => {
      const verdict = corroborateTelegramHandler('@acmechat', {
        teamName: 'Acme',
        websiteSignals: { extractedAt: 'x', telegramHandler: 'acmechat' },
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
    });
  });

  describe('blog', () => {
    it('blog subdomain of website → host-corroborated', () => {
      const verdict = corroborateBlog('https://blog.acme.com/posts', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict?.note).toBe('host corroborated');
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
    });

    it('blog as a path on the website host → host-corroborated', () => {
      const verdict = corroborateBlog('https://acme.com/blog', {
        teamName: 'Acme',
        website: 'https://www.acme.com',
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
    });

    it('blog on a completely different host → no verdict', () => {
      const verdict = corroborateBlog('https://medium.com/@acme', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict).toBeNull();
    });
  });

  describe('website', () => {
    const base: CorroborationContext = { teamName: 'Acme Robotics' };

    it('reachable + og:site_name token-match → agrees+high (og-name-match)', () => {
      const verdict = corroborateWebsite('https://acme.com', {
        ...base,
        websiteReachable: true,
        websiteSignals: { extractedAt: 'x', ogSiteName: 'Acme Robotics — Industrial Robotics' },
      });
      expect(verdict?.note).toContain('og name match');
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
    });

    it('reachable + jsonld org name token-match → agrees+high (jsonld-name-match)', () => {
      const verdict = corroborateWebsite('https://acme.com', {
        ...base,
        websiteReachable: true,
        websiteSignals: { extractedAt: 'x', jsonLdOrgName: 'Acme Robotics, Inc' },
      });
      expect(verdict?.note).toContain('jsonld name match');
    });

    it('multiple anchors firing → concatenated note', () => {
      const verdict = corroborateWebsite('https://acme.com', {
        ...base,
        websiteReachable: true,
        websiteSignals: {
          extractedAt: 'x',
          ogSiteName: 'Acme Robotics',
          jsonLdOrgName: 'Acme Robotics Inc',
        },
      });
      expect(verdict?.note).toBe('og name match + jsonld name match');
    });

    it('not reachable → no verdict regardless of anchors', () => {
      const verdict = corroborateWebsite('https://acme.com', {
        ...base,
        websiteReachable: false,
        websiteSignals: { extractedAt: 'x', ogSiteName: 'Acme Robotics' },
      });
      expect(verdict).toBeNull();
    });

    it('reachable but no name anchors → no verdict (single-source insufficient)', () => {
      const verdict = corroborateWebsite('https://acme.com', { ...base, websiteReachable: true });
      expect(verdict).toBeNull();
    });

    it('reachable + sd-website-host-match (when sd-name-match is exact) → agrees+high', () => {
      const verdict = corroborateWebsite('https://acme.com', {
        ...base,
        websiteReachable: true,
        scrapingDogNameMatch: 'exact',
        scrapingDogProfile: {
          universalNameId: 'acme',
          companyName: 'Acme Robotics',
          profilePhoto: null,
          website: 'https://www.acme.com',
          tagline: null,
          about: null,
          industries: [],
          specialties: [],
          founded: null,
          headquarters: null,
          linkedinInternalId: null,
        },
      });
      expect(verdict?.note).toContain('sd website host match');
    });
  });

  describe('namesShareSubstantiveToken', () => {
    it('shares substantive token despite stopwords', () => {
      expect(namesShareSubstantiveToken('Acme Labs', 'Acme Robotics')).toBe(true);
      expect(namesShareSubstantiveToken('Acme Labs', 'Beta Labs')).toBe(false); // 'labs' is a stopword
      expect(namesShareSubstantiveToken('Acme Inc', 'Beta Inc')).toBe(false); // 'inc' is a stopword
    });
  });

  describe('runCorroboration (dispatcher)', () => {
    it('emits the canonical failure case verdict for contactMethod', () => {
      const out = runCorroboration(
        [
          { field: 'contactMethod', value: 'test@bestTeam.xyz' },
          { field: 'website', value: 'https://bestTeam.xyz' },
        ],
        { teamName: 'Best Team', website: 'https://bestTeam.xyz', websiteReachable: true }
      );
      expect(out.contactMethod?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(out.contactMethod?.note).toBe('email domain matches website');
      // website needs name corroboration to fire — none here, so falls through:
      expect(out.website).toBeUndefined();
    });

    it('skips array-valued fields entirely (industryTags / investmentFocus)', () => {
      const out = runCorroboration([{ field: 'industryTags', value: ['AI', 'DeFi'] }], { teamName: 'X' });
      expect(out.industryTags).toBeUndefined();
    });
  });
});
