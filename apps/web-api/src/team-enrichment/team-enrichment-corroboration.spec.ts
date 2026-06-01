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

    it('blog on a completely different host with unrelated handle → no verdict', () => {
      const verdict = corroborateBlog('https://medium.com/@unrelated-author', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict).toBeNull();
    });

    // Bench case (Astera Institute): asterainstitute.substack.com — handle is
    // the concatenated team name. host-corroborated can't fire (different host),
    // so the new rule must catch it.
    it('substack subdomain encoding the team name → name in blog handle', () => {
      const verdict = corroborateBlog('https://asterainstitute.substack.com/', {
        teamName: 'Astera Institute',
        website: 'https://astera.org/',
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
      expect(verdict?.note).toBe('name in blog handle');
    });

    it('substack subdomain encoding multi-word team name → name in blog handle', () => {
      // "Compute Labs" → "labs" is a stopword, "compute" is the only substantive token.
      const verdict = corroborateBlog('https://computelabs.substack.com/', {
        teamName: 'Compute Labs',
        website: 'https://www.computelabs.ai',
      });
      expect(verdict?.note).toBe('name in blog handle');
    });

    it('medium subdomain → name in blog handle', () => {
      const verdict = corroborateBlog('https://labdao.medium.com/', {
        teamName: 'LabDAO',
        website: 'https://www.labdao.xyz',
      });
      expect(verdict?.note).toBe('name in blog handle');
    });

    it('medium path with @handle → name in blog handle', () => {
      const verdict = corroborateBlog('https://medium.com/@manifestnetwork', {
        teamName: 'Manifest Network',
        website: 'https://manifestai.org/',
      });
      expect(verdict?.note).toBe('name in blog handle');
    });

    it('paragraph.xyz with @handle → name in blog handle', () => {
      const verdict = corroborateBlog('https://paragraph.xyz/@cabin', {
        teamName: 'Cabin',
        website: 'https://cabin.city',
      });
      expect(verdict?.note).toBe('name in blog handle');
    });

    // Bench case (Crecimiento): substack.com/@<handle> user-profile URL,
    // distinct from the <handle>.substack.com publication URL pattern.
    it('substack user-profile path (substack.com/@handle) → name in blog handle', () => {
      const verdict = corroborateBlog('https://substack.com/@crecimientoar/posts', {
        teamName: 'Crecimiento',
        website: 'https://bringargentinaonchain.org',
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.note).toBe('name in blog handle');
    });

    it('substack user-profile path with unrelated handle → no verdict', () => {
      const verdict = corroborateBlog('https://substack.com/@unrelated-author/posts', {
        teamName: 'Crecimiento',
        website: 'https://bringargentinaonchain.org',
      });
      expect(verdict).toBeNull();
    });

    // Bench negative case (Convergent Research FROs): "essentialtechnology"
    // subdomain has no substantive-token overlap with the team name. Correctly
    // stays in review — admin should verify whether this is really their blog.
    it('substack subdomain unrelated to team name → no verdict', () => {
      const verdict = corroborateBlog('https://essentialtechnology.substack.com/', {
        teamName: 'Convergent Research FROs',
        website: 'https://convergentresearch.org',
      });
      expect(verdict).toBeNull();
    });

    it('mirror.xyz with .eth suffix → name in blog handle', () => {
      const verdict = corroborateBlog('https://mirror.xyz/acme.eth', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict?.note).toBe('name in blog handle');
    });

    it('ghost.io subdomain → name in blog handle', () => {
      const verdict = corroborateBlog('https://acmehq.ghost.io/', {
        teamName: 'Acme HQ',
        website: 'https://acme.com',
      });
      expect(verdict?.note).toBe('name in blog handle');
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
      // Host first-label "acme" starts with team token "acme" too, so three anchors
      // fire and concatenate in this order: name in website host + og + jsonld.
      expect(verdict?.note).toBe('name in website host + og name match + jsonld name match');
    });

    it('not reachable → no verdict regardless of anchors', () => {
      const verdict = corroborateWebsite('https://acme.com', {
        ...base,
        websiteReachable: false,
        websiteSignals: { extractedAt: 'x', ogSiteName: 'Acme Robotics' },
      });
      expect(verdict).toBeNull();
    });

    it('reachable but no name anchors AND host unrelated to team name → no verdict', () => {
      // "Acme Robotics" team but website is `unrelated.com` — first label "unrelated"
      // doesn't start with "acme" or "robotics", and no second-source signals exist.
      const verdict = corroborateWebsite('https://unrelated.com', { ...base, websiteReachable: true });
      expect(verdict).toBeNull();
    });

    // Bench case (Eon): `eon.systems` for team "Eon". No websiteSignals or
    // ScrapingDog profile (Stage 1 didn't run), but the host first-label IS
    // the team name. Combined with reachability that's enough for high confidence.
    it('reachable + host first-label starts with team token → name in website host', () => {
      const verdict = corroborateWebsite('https://eon.systems/', {
        teamName: 'Eon',
        websiteReachable: true,
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
      expect(verdict?.note).toBe('name in website host');
    });

    // Bench case (Devonian Systems): host `devonian.ai` starts with the team's
    // primary token. Same rule, multi-word team name with stopword filtering.
    it('reachable + host matches first substantive team token (multi-word team) → match', () => {
      const verdict = corroborateWebsite('https://devonian.ai/', {
        teamName: 'Devonian Systems (Operad)',
        websiteReachable: true,
      });
      expect(verdict?.note).toBe('name in website host');
    });

    // False-positive guard: team "Eon" with a domain that has "eon" buried
    // mid-word (`beontop.com`). The substring exists but isn't a prefix of the
    // first label, so the rule correctly rejects it.
    it('reachable but host has team token mid-word (not prefix) → no verdict', () => {
      const verdict = corroborateWebsite('https://beontop.com/', {
        teamName: 'Eon',
        websiteReachable: true,
      });
      expect(verdict).toBeNull();
    });

    // Abbreviated brand case: `fil.org` for "Filecoin Foundation". The host
    // first-label is too short to contain the team token — falls through to AI.
    it('reachable but host is an abbreviation of team name → no verdict (AI handles)', () => {
      const verdict = corroborateWebsite('https://fil.org/', {
        teamName: 'Filecoin Foundation',
        websiteReachable: true,
      });
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
      // website also auto-promotes: reachable + host first-label "bestteam"
      // starts with team token "best".
      expect(out.website?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(out.website?.note).toBe('name in website host');
    });

    it('skips array-valued fields entirely (industryTags / investmentFocus)', () => {
      const out = runCorroboration([{ field: 'industryTags', value: ['AI', 'DeFi'] }], { teamName: 'X' });
      expect(out.industryTags).toBeUndefined();
    });
  });
});
