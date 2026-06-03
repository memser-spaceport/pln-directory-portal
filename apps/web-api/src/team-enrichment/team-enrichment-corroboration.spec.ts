import {
  CorroborationContext,
  corroborateBlog,
  corroborateBySource,
  corroborateContactMethod,
  corroborateLinkedinHandler,
  corroborateTelegramHandler,
  corroborateTwitterHandler,
  corroborateWebsite,
  namesShareSubstantiveToken,
  runCorroboration,
} from './team-enrichment-corroboration';
import { EnrichmentSource, FieldConfidence, JudgmentSource, JudgmentVerdict } from './team-enrichment.types';

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

    it('non-email contactMethod with unrelated host (Discord invite) → no verdict (falls through)', () => {
      const verdict = corroborateContactMethod('https://discord.gg/xxxyyy', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict).toBeNull();
    });

    // Bench case (FrodoBots): user-supplied contactMethod is just an anchor
    // link back to the homepage — host matches the verified website, so it
    // identity-verifies even though it's not a useful "contact method" per se.
    it('URL contactMethod whose host matches website → url host matches website', () => {
      const verdict = corroborateContactMethod('https://www.frodobots.ai/#', {
        teamName: 'FrodoBots',
        website: 'https://www.frodobots.ai/',
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
      expect(verdict?.note).toBe('url host matches website');
    });

    it('URL contactMethod on a /contact subpage of website host → url host matches website', () => {
      const verdict = corroborateContactMethod('https://acme.com/contact', {
        teamName: 'Acme',
        website: 'https://www.acme.com',
      });
      expect(verdict?.note).toBe('url host matches website');
    });

    it('URL contactMethod on subdomain of website host → url host matches website', () => {
      const verdict = corroborateContactMethod('https://support.acme.com/', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict?.note).toBe('url host matches website');
    });

    it('URL contactMethod on an unrelated host (Calendly) → no verdict', () => {
      const verdict = corroborateContactMethod('https://calendly.com/acme-team', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict).toBeNull();
    });

    // Bench case (Clockwork Labs): team owns a product domain (`spacetimedb.com`)
    // as website and a corporate domain (`clockworklabs.io`) for email. Email
    // domain first-label `clockworklabs` starts with team token `clockwork`
    // (`labs` is a stopword and dropped).
    it('brand-alias email: domain first-label starts with team token → email domain matches team name', () => {
      const verdict = corroborateContactMethod('contact@clockworklabs.io', {
        teamName: 'Clockwork Labs',
        website: 'https://spacetimedb.com/home',
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
      expect(verdict?.note).toBe('email domain matches team name');
    });

    it('brand-alias URL: host first-label starts with team token → url host matches team name', () => {
      const verdict = corroborateContactMethod('https://clockworklabs.io/contact', {
        teamName: 'Clockwork Labs',
        website: 'https://spacetimedb.com/home',
      });
      expect(verdict?.note).toBe('url host matches team name');
    });

    // False-positive guard: team "Eon" with email on `beontop.com`. The team
    // token `eon` appears mid-word in `beontop`, but the prefix-only check
    // correctly rejects (`beontop` doesn't START with `eon`).
    it('email on a domain that contains team token mid-word (not prefix) → no verdict', () => {
      const verdict = corroborateContactMethod('contact@beontop.com', {
        teamName: 'Eon',
        website: 'https://eon.systems',
      });
      expect(verdict).toBeNull();
    });

    it('email on a generic free-mail host (gmail) → no verdict', () => {
      // `gmail.com` first-label `gmail` doesn't start with any team token.
      const verdict = corroborateContactMethod('founder@gmail.com', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict).toBeNull();
    });

    it('null or empty value → no verdict', () => {
      expect(corroborateContactMethod(null, { teamName: 'Acme' })).toBeNull();
      expect(corroborateContactMethod('', { teamName: 'Acme' })).toBeNull();
    });

    describe('founder-contact cross-reference', () => {
      const leadCtx = {
        teamName: 'Acme',
        website: 'https://acme.com',
        teamLeadContacts: {
          emails: ['jane@gmail.com', 'founder@acmefounders.io'],
          twitter: ['janedoe'],
          telegram: ['jane_chat'],
          linkedin: ['in/jane-doe', 'jane-doe'],
        },
      };

      // Bench pattern (pre-seed teams): founder's personal gmail used as team
      // contact. Host-match can't fire because gmail.com isn't the team domain.
      it('email matches a lead member → founder contact match', () => {
        const v = corroborateContactMethod('jane@gmail.com', leadCtx);
        expect(v?.verdict).toBe(JudgmentVerdict.Agrees);
        expect(v?.confidence).toBe(FieldConfidence.High);
        expect(v?.note).toBe('founder contact match');
      });

      it('email on founder personal domain (no website host match) → founder contact match', () => {
        const v = corroborateContactMethod('founder@acmefounders.io', leadCtx);
        expect(v?.note).toBe('founder contact match');
      });

      it('email matches BOTH website-host rule AND a lead → website-host rule wins (stronger)', () => {
        // hostsMatch fires first and returns 'email domain matches website' (score 100).
        // founder match (score 95) is never reached. That's intentional ordering.
        const v = corroborateContactMethod('jane@acme.com', {
          ...leadCtx,
          teamLeadContacts: { ...leadCtx.teamLeadContacts, emails: ['jane@acme.com'] },
        });
        expect(v?.note).toBe('email domain matches website');
      });

      it('email of someone NOT a lead → no verdict', () => {
        const v = corroborateContactMethod('stranger@unrelated.org', leadCtx);
        expect(v).toBeNull();
      });

      it('@handle matching a lead twitter → founder contact match', () => {
        const v = corroborateContactMethod('@janedoe', leadCtx);
        expect(v?.note).toBe('founder contact match');
      });

      it('twitter URL matching a lead twitter → founder contact match', () => {
        const v = corroborateContactMethod('https://twitter.com/janedoe', leadCtx);
        expect(v?.note).toBe('founder contact match');
      });

      it('x.com URL matching a lead twitter → founder contact match', () => {
        const v = corroborateContactMethod('https://x.com/janedoe', leadCtx);
        expect(v?.note).toBe('founder contact match');
      });

      it('t.me URL matching a lead telegram → founder contact match', () => {
        const v = corroborateContactMethod('https://t.me/jane_chat', leadCtx);
        expect(v?.note).toBe('founder contact match');
      });

      it('linkedin URL matching a lead → founder contact match', () => {
        const v = corroborateContactMethod('https://www.linkedin.com/in/jane-doe/', leadCtx);
        expect(v?.note).toBe('founder contact match');
      });

      it('handle that does not match any lead → no verdict', () => {
        const v = corroborateContactMethod('@strangerhandle', leadCtx);
        expect(v).toBeNull();
      });

      it('empty teamLeadContacts → falls through normally', () => {
        const v = corroborateContactMethod('jane@gmail.com', {
          teamName: 'Acme',
          website: 'https://acme.com',
          teamLeadContacts: { emails: [], twitter: [], telegram: [], linkedin: [] },
        });
        expect(v).toBeNull();
      });
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

    it('no website signals but handle starts with team token → name in twitter handle', () => {
      // Bench case (Eon): twitter `eonsys` for team "Eon". No website signals
      // but the handle starts with the team token.
      const verdict = corroborateTwitterHandler('eonsys', { teamName: 'Eon' });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
      expect(verdict?.note).toBe('name in twitter handle');
    });

    it('handle with underscore + suffix → name in twitter handle', () => {
      // Bench case (Surus): twitter `Surus_io` for team "Surus".
      const verdict = corroborateTwitterHandler('Surus_io', { teamName: 'Surus' });
      expect(verdict?.note).toBe('name in twitter handle');
    });

    it('handle that does not start with team token → no verdict', () => {
      // Bench case (Near Foundation / cryptonear) — `cryptonear` doesn't START
      // with "near", even though "near" is in there mid-word. Correctly stays
      // in review.
      const verdict = corroborateTwitterHandler('cryptonear', { teamName: 'Near Foundation' });
      expect(verdict).toBeNull();
    });

    it('no website signals AND handle unrelated → no verdict', () => {
      expect(corroborateTwitterHandler('unrelated_account', { teamName: 'Acme' })).toBeNull();
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

    it('slug starts with team token → name in linkedin slug', () => {
      // Bench case (Eon): `company/eon-systems-pbc` — slug starts with "eon".
      const verdict = corroborateLinkedinHandler('company/eon-systems-pbc', { teamName: 'Eon' });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.note).toBe('name in linkedin slug');
    });

    it('slug from full URL starts with team token → name in linkedin slug', () => {
      const verdict = corroborateLinkedinHandler('https://www.linkedin.com/company/mosaia-ai', {
        teamName: 'Mosaia',
      });
      expect(verdict?.note).toBe('name in linkedin slug');
    });

    it('slug unrelated to team name → no verdict', () => {
      const verdict = corroborateLinkedinHandler('company/totally-different', { teamName: 'Eon' });
      expect(verdict).toBeNull();
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

    it('handle starts with team token → name in telegram handle', () => {
      // Bench cases: `fileverse`, `vitadao`, `talentprotocol`.
      const verdict = corroborateTelegramHandler('fileverse', { teamName: 'Fileverse' });
      expect(verdict?.note).toBe('name in telegram handle');
    });

    it('handle with suffix starts with team token → name in telegram handle', () => {
      // Bench case (Hex Trust): `hextrustannouncements` for "Hex Trust".
      const verdict = corroborateTelegramHandler('hextrustannouncements', { teamName: 'Hex Trust' });
      expect(verdict?.note).toBe('name in telegram handle');
    });

    it('handle that does not start with team token → no verdict', () => {
      // Bench case (Near Foundation / cryptonear) — same shape as Twitter case.
      const verdict = corroborateTelegramHandler('cryptonear', { teamName: 'Near Foundation' });
      expect(verdict).toBeNull();
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

    // Bench case (Astera Institute, abbreviated): astera.substack.com — handle
    // is just the leading distinctive team token, NOT the full concatenation.
    // Prefix-only check accepts this; the old "every-token-as-substring" rule
    // would have rejected it because "institute" isn't in "astera".
    it('substack subdomain with only the leading team token → name in blog handle', () => {
      const verdict = corroborateBlog('https://astera.substack.com/', {
        teamName: 'Astera Institute',
        website: 'https://astera.org/',
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
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

    it('definitive 4xx/5xx (reachable=false) → no verdict regardless of anchors', () => {
      const verdict = corroborateWebsite('https://acme.com', {
        ...base,
        websiteReachable: false,
        websiteSignals: { extractedAt: 'x', ogSiteName: 'Acme Robotics' },
      });
      expect(verdict).toBeNull();
    });

    // Bench case (Compute Labs / computelabs.ai): site is alive in a browser
    // but returns HTTP 403 to non-browser fetches (full Cloudflare bot
    // protection). Probe reports `reachable: null` (inconclusive, not false).
    // The deterministic name anchor IS the identity proof here.
    it('bot-blocked (reachable=null) + name anchor matches → still auto-promotes', () => {
      const verdict = corroborateWebsite('https://www.computelabs.ai', {
        teamName: 'Compute Labs',
        websiteReachable: null, // bot-blocked, not definitively dead
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.note).toBe('name in website host');
    });

    it('bot-blocked (reachable=null) + NO name anchor → no verdict (single signal insufficient)', () => {
      const verdict = corroborateWebsite('https://unrelated.com', {
        teamName: 'Compute Labs',
        websiteReachable: null,
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

    // Bench case (Astera Institute longDescription): value sourced from
    // ScrapingDog at high enrichment confidence. The AI judge was downgrading
    // to medium because LinkedIn-paraphrased text doesn't match other sources
    // verbatim. Source-trust rule short-circuits the AI for trusted sources.
    it('source-trust: scrapingdog + high → auto-approve regardless of field-specific rules', () => {
      const out = runCorroboration(
        [
          {
            field: 'longDescription',
            value: 'Astera advances breakthrough science and tech for the public benefit.',
            source: EnrichmentSource.ScrapingDog,
            enrichmentConfidence: 'high',
          },
        ],
        { teamName: 'Astera Institute' }
      );
      expect(out.longDescription?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(out.longDescription?.confidence).toBe(FieldConfidence.High);
      expect(out.longDescription?.note).toBe('sourced from linkedin');
    });

    it('source-trust: open-graph + high → auto-approve (website-extracted signal)', () => {
      const out = runCorroboration(
        [
          {
            field: 'twitterHandler',
            value: 'somehandle',
            source: EnrichmentSource.OpenGraph,
            enrichmentConfidence: 'high',
          },
        ],
        { teamName: 'Some Team' }
      );
      expect(out.twitterHandler?.note).toBe('sourced from website');
    });

    it('source-trust: medium enrichment confidence does NOT auto-approve', () => {
      const out = runCorroboration(
        [
          {
            field: 'longDescription',
            value: 'Some description.',
            source: EnrichmentSource.ScrapingDog,
            enrichmentConfidence: 'medium',
          },
        ],
        { teamName: 'Some Team' }
      );
      // Description has no field-specific corroboration rule, so falls through to AI.
      expect(out.longDescription).toBeUndefined();
    });

    it('source-trust: ai source does NOT auto-approve (LLM self-confidence not trusted)', () => {
      const out = runCorroboration(
        [
          {
            field: 'longDescription',
            value: 'Some description from AI.',
            source: EnrichmentSource.AI,
            enrichmentConfidence: 'high',
          },
        ],
        { teamName: 'Some Team' }
      );
      expect(out.longDescription).toBeUndefined();
    });
  });

  describe('corroborateBySource', () => {
    it('scrapingdog + high → agrees+high (sourced from linkedin)', () => {
      const v = corroborateBySource(EnrichmentSource.ScrapingDog, 'high');
      expect(v?.note).toBe('sourced from linkedin');
      expect(v?.judgedVia).toBe(JudgmentSource.Corroboration);
    });

    it('open-graph + high → agrees+high (sourced from website)', () => {
      const v = corroborateBySource(EnrichmentSource.OpenGraph, 'high');
      expect(v?.note).toBe('sourced from website');
    });

    it('ai source → null (LLM-self-confidence is what the judge exists to verify)', () => {
      expect(corroborateBySource(EnrichmentSource.AI, 'high')).toBeNull();
    });

    it('non-high enrichment confidence → null', () => {
      expect(corroborateBySource(EnrichmentSource.ScrapingDog, 'medium')).toBeNull();
      expect(corroborateBySource(EnrichmentSource.ScrapingDog, 'low')).toBeNull();
      expect(corroborateBySource(EnrichmentSource.ScrapingDog, undefined)).toBeNull();
    });

    it('unknown source → null', () => {
      expect(corroborateBySource('something-else', 'high')).toBeNull();
      expect(corroborateBySource(undefined, 'high')).toBeNull();
    });
  });
});
