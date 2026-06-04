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

    // Bench case (LabDAO): Discord invite URL with team-named slug.
    it('discord.com/invite/<slug> matching team name → name in invite slug', () => {
      const verdict = corroborateContactMethod('https://discord.com/invite/labdao', {
        teamName: 'LabDAO',
        website: 'https://www.labdao.xyz',
      });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.note).toBe('name in invite slug');
    });

    // Bench case (ConsenSys): single-token team, slug equals team name.
    it('discord.com/invite/<slug> equal to team token → name in invite slug', () => {
      const verdict = corroborateContactMethod('https://discord.com/invite/consensys', {
        teamName: 'ConsenSys',
        website: 'https://consensys.net',
      });
      expect(verdict?.note).toBe('name in invite slug');
    });

    // Bench case (Manifest Network): multi-word team, stopword "network" dropped,
    // slug "manifestnetwork" still starts with team token "manifest".
    it('discord.com/invite/<slug> starts with team token (stopword-aware) → name in invite slug', () => {
      const verdict = corroborateContactMethod('https://discord.com/invite/manifestnetwork', {
        teamName: 'Manifest Network',
        website: 'https://manifestai.org/',
      });
      expect(verdict?.note).toBe('name in invite slug');
    });

    it('discord.gg/<slug> short link with team-named slug → name in invite slug', () => {
      const verdict = corroborateContactMethod('https://discord.gg/labdao', {
        teamName: 'LabDAO',
        website: 'https://www.labdao.xyz',
      });
      expect(verdict?.note).toBe('name in invite slug');
    });

    // Bench negatives (Lava Network / Drips / NFT.Storage / DeSci Labs): random
    // opaque invite IDs that don't start with any team token. Correctly stay in review.
    it('discord.gg/<opaque-id> does NOT match team name → no verdict', () => {
      const verdict = corroborateContactMethod('https://discord.gg/BakDKKDpHF', {
        teamName: 'Drips',
        website: 'https://www.drips.network',
      });
      expect(verdict).toBeNull();
    });

    it('discord.com/invite/<opaque-id> for Lava Network → no verdict', () => {
      const verdict = corroborateContactMethod('https://discord.com/invite/5VcqgwMmkA', {
        teamName: 'Lava Network',
        website: 'https://www.lavanet.xyz',
      });
      expect(verdict).toBeNull();
    });

    it('t.me/<slug> with team-named slug → name in invite slug', () => {
      const verdict = corroborateContactMethod('https://t.me/acmechat', {
        teamName: 'Acme',
        website: 'https://acme.com',
      });
      expect(verdict?.note).toBe('name in invite slug');
    });

    it('t.me/+<token> (one-time join token, not a team handle) → no verdict', () => {
      // Bench case (Hypercerts): `https://t.me/+YF9AYb6zCv1mNDJi`. The +<token>
      // form is an opaque single-use invite, not a team-identifying slug.
      const verdict = corroborateContactMethod('https://t.me/+YF9AYb6zCv1mNDJi', {
        teamName: 'Hypercerts',
        website: 'https://hypercerts.org',
      });
      expect(verdict).toBeNull();
    });

    it('linktr.ee/<slug> matching team name → name in invite slug', () => {
      const verdict = corroborateContactMethod('https://linktr.ee/acmehq', {
        teamName: 'Acme HQ',
        website: 'https://acme.com',
      });
      expect(verdict?.note).toBe('name in invite slug');
    });

    it('null or empty value → no verdict', () => {
      expect(corroborateContactMethod(null, { teamName: 'Acme' })).toBeNull();
      expect(corroborateContactMethod('', { teamName: 'Acme' })).toBeNull();
    });

    describe('user-trusted fallback (ChangedByUser)', () => {
      // A team lead set `contactMethod` to a community chat URL that no
      // deterministic anchor can verify. The lead has authority over their
      // own contact channel; without the fallback the AI judge will mark
      // these uncertain forever and the team will live in the review queue.
      it('off-host chat path (Lit Protocol case): user-owned → user trusted', () => {
        const v = corroborateContactMethod(
          'https://getlit.dev/chat',
          { teamName: 'Lit Protocol', website: 'https://litprotocol.com' },
          { isUserOwned: true }
        );
        expect(v?.verdict).toBe(JudgmentVerdict.Agrees);
        expect(v?.confidence).toBe(FieldConfidence.High);
        expect(v?.note).toBe('user trusted');
      });

      it('discord.gg/<opaque-token>: user-owned → user trusted', () => {
        const v = corroborateContactMethod(
          'https://discord.gg/BakDKKDpHF',
          { teamName: 'Drips', website: 'https://www.drips.network' },
          { isUserOwned: true }
        );
        expect(v?.note).toBe('user trusted');
      });

      it('discord.com/invite/<opaque-token>: user-owned → user trusted', () => {
        const v = corroborateContactMethod(
          'https://discord.com/invite/5VcqgwMmkA',
          { teamName: 'Lava Network', website: 'https://www.lavanet.xyz' },
          { isUserOwned: true }
        );
        expect(v?.note).toBe('user trusted');
      });

      it('Calendly URL: user-owned → user trusted', () => {
        const v = corroborateContactMethod(
          'https://calendly.com/acme-team',
          { teamName: 'Acme', website: 'https://acme.com' },
          { isUserOwned: true }
        );
        expect(v?.note).toBe('user trusted');
      });

      it('arbitrary off-host email: user-owned → user trusted', () => {
        // Team lead supplied a personal email that's not on the website
        // domain and doesn't match any other anchor. We trust them anyway.
        const v = corroborateContactMethod(
          'jane@personaldomain.io',
          { teamName: 'Acme', website: 'https://acme.com' },
          { isUserOwned: true }
        );
        expect(v?.note).toBe('user trusted');
      });

      it('deterministic anchor wins when both fire (host-match before fallback)', () => {
        // ChangedByUser email matches website host — the email-domain rule
        // outranks the user-trusted fallback (note shows the actual proof,
        // not a generic "user trusted"). Score 100 > 85.
        const v = corroborateContactMethod(
          'hello@acme.com',
          { teamName: 'Acme', website: 'https://acme.com' },
          { isUserOwned: true }
        );
        expect(v?.note).toBe('email domain matches website');
      });

      it('Enriched (not user-owned) value with no anchor → no verdict', () => {
        // AI-supplied contactMethod URL that doesn't match any anchor.
        // Falls through to the AI judge (no user authority claim).
        const v = corroborateContactMethod(
          'https://getlit.dev/chat',
          { teamName: 'Lit Protocol', website: 'https://litprotocol.com' },
          { isUserOwned: false }
        );
        expect(v).toBeNull();
      });

      it('omitted isUserOwned (defaults to false) → no fallback', () => {
        const v = corroborateContactMethod('https://getlit.dev/chat', {
          teamName: 'Lit Protocol',
          website: 'https://litprotocol.com',
        });
        expect(v).toBeNull();
      });

      it('via dispatcher: ChangedByUser contactMethod → user trusted', () => {
        const out = runCorroboration(
          [{ field: 'contactMethod', value: 'https://getlit.dev/chat', isUserOwned: true }],
          { teamName: 'Lit Protocol', website: 'https://litprotocol.com' }
        );
        expect(out.contactMethod?.verdict).toBe(JudgmentVerdict.Agrees);
        expect(out.contactMethod?.confidence).toBe(FieldConfidence.High);
        expect(out.contactMethod?.note).toBe('user trusted');
      });
    });

    describe('team-owned-channel cross-reference', () => {
      // Bench case (Hypercerts, clnez5ttg00021h02he9ljx5m): user set both
      // `contactMethod` and `telegramHandler` to the SAME `t.me/+opaque-token`
      // invite URL. The `+token` form correctly fails `name in invite slug`
      // (opaque join token, not team-identifying), so previously the AI judge
      // marked it `agrees + medium` → admin review. The duplicate self-
      // declaration is the identity proof.
      it('Hypercerts canonical case: contactMethod URL == team telegramHandler → matches team telegram', () => {
        const v = corroborateContactMethod('https://t.me/+YF9AYb6zCv1mNDJi', {
          teamName: 'Hypercerts',
          website: 'https://hypercerts.org',
          teamOwnedChannels: { telegramHandler: 'https://t.me/+YF9AYb6zCv1mNDJi' },
        });
        expect(v?.verdict).toBe(JudgmentVerdict.Agrees);
        expect(v?.confidence).toBe(FieldConfidence.High);
        expect(v?.note).toBe('matches team telegram');
      });

      it('contactMethod URL == team twitterHandler URL → matches team twitter', () => {
        const v = corroborateContactMethod('https://twitter.com/acmehq', {
          teamName: 'Acme',
          website: 'https://acme.com',
          teamOwnedChannels: { twitterHandler: 'https://twitter.com/acmehq' },
        });
        expect(v?.note).toBe('matches team twitter');
      });

      // Normalization: contactMethod is full twitter URL, team has bare handle.
      // Both normalize to `acmehq`.
      it('normalizes across URL vs bare-handle for twitter', () => {
        const v = corroborateContactMethod('https://x.com/acmehq', {
          teamName: 'Acme',
          website: 'https://acme.com',
          teamOwnedChannels: { twitterHandler: '@acmehq' },
        });
        expect(v?.note).toBe('matches team twitter');
      });

      it('contactMethod URL == team linkedinHandler → matches team linkedin', () => {
        const v = corroborateContactMethod('https://www.linkedin.com/company/acme-labs', {
          teamName: 'Acme',
          website: 'https://acme.com',
          teamOwnedChannels: { linkedinHandler: 'company/acme-labs' },
        });
        expect(v?.note).toBe('matches team linkedin');
      });

      it('contactMethod URL == team blog (off-site host) → matches team blog', () => {
        // Substack blog on an off-site host — `url host matches website`
        // can't fire because substack.com isn't a subdomain of acme.com.
        // The team-owned-channel rule is the one that catches this.
        const v = corroborateContactMethod('https://acmehq.substack.com/about', {
          teamName: 'Acme',
          website: 'https://acme.com',
          teamOwnedChannels: { blog: 'https://acmehq.substack.com/about' },
        });
        expect(v?.note).toBe('matches team blog');
      });

      it('bare @handle == team twitter → matches team social', () => {
        const v = corroborateContactMethod('@acmehq', {
          teamName: 'Acme',
          website: 'https://acme.com',
          teamOwnedChannels: { twitterHandler: 'https://twitter.com/acmehq' },
        });
        expect(v?.note).toBe('matches team social');
      });

      it('bare @handle == team telegram → matches team social', () => {
        const v = corroborateContactMethod('@acme_chat', {
          teamName: 'Acme',
          website: 'https://acme.com',
          teamOwnedChannels: { telegramHandler: 'acme_chat' },
        });
        expect(v?.note).toBe('matches team social');
      });

      it('different telegram URL than team has on file → no verdict', () => {
        // contact is on a DIFFERENT invite slug than what's on telegramHandler.
        // We don't accept "any t.me URL" — only the exact same handle.
        const v = corroborateContactMethod('https://t.me/+DIFFERENT123', {
          teamName: 'Hypercerts',
          website: 'https://hypercerts.org',
          teamOwnedChannels: { telegramHandler: 'https://t.me/+YF9AYb6zCv1mNDJi' },
        });
        expect(v).toBeNull();
      });

      it('website-host rule still wins when both apply', () => {
        // contactMethod URL is the team's blog AND its host matches the
        // website host. The earlier `url host matches website` rule fires
        // first (score 95, same as ours, but ordered above).
        const v = corroborateContactMethod('https://acme.com/contact', {
          teamName: 'Acme',
          website: 'https://acme.com',
          teamOwnedChannels: { blog: 'https://acme.com/contact' },
        });
        expect(v?.note).toBe('url host matches website');
      });
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

    // Bench case (ContributionDAO): handle `@contributedao` is the team's
    // own X account. Doesn't prefix-match team token `contributiondao` (handle
    // is shorter and slightly different spelling: `contribute` vs `contribution`).
    // Without isUserOwned, falls to AI (which may wrongly disagree on the
    // grounds that the website declares a different handle). With isUserOwned,
    // user-trusted fallback fires.
    it('user-supplied handle that no deterministic anchor matches → user trusted', () => {
      const verdict = corroborateTwitterHandler(
        'contributedao',
        { teamName: 'ContributionDAO', websiteSignals: { extractedAt: 'x', twitterHandler: 'theplebth' } },
        { isUserOwned: true }
      );
      expect(verdict).not.toBeNull();
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
      expect(verdict?.note).toBe('user trusted');
    });

    it('AI-supplied unrelated handle → no verdict (falls through to AI)', () => {
      const verdict = corroborateTwitterHandler(
        'contributedao',
        { teamName: 'ContributionDAO', websiteSignals: { extractedAt: 'x', twitterHandler: 'theplebth' } },
        { isUserOwned: false }
      );
      expect(verdict).toBeNull();
    });

    it('user-trusted does NOT override stronger deterministic anchor', () => {
      // Website self-declared anchor still wins on score 100 vs 85.
      const verdict = corroborateTwitterHandler(
        'acme',
        { teamName: 'Acme', websiteSignals: { extractedAt: 'x', twitterHandler: '@acme' } },
        { isUserOwned: true }
      );
      expect(verdict?.note).toBe('website self declared');
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

    // Bench case (Manifest Network): slug `company/the-manifest-network` —
    // common LinkedIn pattern that puts a leading `the-` before the team
    // name. Prefix-only check fails ('the-manifest-network'.startsWith('manifest') = false).
    // Hyphen-segment equality catches it ('manifest' equals team token).
    it('slug with leading `the-` before team name → name in linkedin slug', () => {
      const verdict = corroborateLinkedinHandler('company/the-manifest-network', { teamName: 'Manifest Network' });
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.note).toBe('name in linkedin slug');
    });

    it('slug with leading `the-` for multi-word team → matches via segment equality', () => {
      const verdict = corroborateLinkedinHandler('company/the-acme-foundation', { teamName: 'Acme Foundation' });
      expect(verdict?.note).toBe('name in linkedin slug');
    });

    // Safety guard: a segment that's a SUPERSET of a team token (not equal)
    // does NOT match. `something-eonical-corp` for team "Eon" — segment
    // 'eonical' is NOT equal to team token 'eon', so the equality check
    // correctly rejects. (Prefix on segment would have false-positived here.)
    it('slug segment that contains team token mid-segment → no verdict (segment equality required)', () => {
      const verdict = corroborateLinkedinHandler('company/something-eonical-corp', { teamName: 'Eon' });
      expect(verdict).toBeNull();
    });

    it('user-supplied linkedin slug that no deterministic anchor matches → user trusted', () => {
      const verdict = corroborateLinkedinHandler(
        'company/some-unrelated-slug',
        { teamName: 'Acme' },
        { isUserOwned: true }
      );
      expect(verdict?.note).toBe('user trusted');
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
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

    it('user-supplied telegram handle that no deterministic anchor matches → user trusted', () => {
      const verdict = corroborateTelegramHandler(
        'somecommunity',
        { teamName: 'Acme' },
        { isUserOwned: true }
      );
      expect(verdict?.note).toBe('user trusted');
      expect(verdict?.confidence).toBe(FieldConfidence.High);
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

    // Bench case (Near): blog `near.org/blog/...` with website `near.foundation`.
    // Different hosts (host-corroborated can't fire), not a 3rd-party platform
    // (name-in-blog-handle can't fire), but both blog host's first label and
    // website host's first label are `near` — the team-token name match against
    // the blog host IS the identity proof, same as `name in website host` for
    // the website rule.
    it('custom-domain blog whose host first-label matches team token → name in blog host', () => {
      const verdict = corroborateBlog(
        'https://near.org/blog/?_gl=1*4ltauw*_up*MQ..*_ga*MTg5MzA0MDM1OS4xNjY4NjMxOTE5',
        {
          teamName: 'Near',
          website: 'https://near.foundation/',
        }
      );
      expect(verdict).not.toBeNull();
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
      expect(verdict?.note).toBe('name in blog host');
    });

    // Safety guard: substring-anywhere shouldn't false-positive. Team "Eon"
    // with blog on `beontop.com` — `beontop` first label does NOT start with
    // `eon`, so the rule correctly rejects.
    it('custom-domain blog whose host contains team token mid-string → no verdict', () => {
      const verdict = corroborateBlog('https://beontop.com/blog', {
        teamName: 'Eon',
        website: 'https://eon.systems/',
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

    // Bench case (Notifi): Medium publication URL without `@` prefix.
    // medium.com supports BOTH `medium.com/@<user>` (user profile, at-handle
    // style) AND `medium.com/<publication>` (team publication, plain path).
    // The publication slug IS team-identifying.
    it('medium publication URL (no @ prefix) matching team token → name in blog handle', () => {
      const verdict = corroborateBlog('https://medium.com/notifi', {
        teamName: 'Notifi',
        website: 'https://notifi.network/',
      });
      expect(verdict?.note).toBe('name in blog handle');
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
    });

    it('medium publication URL with article path → name in blog handle (first segment is publication)', () => {
      const verdict = corroborateBlog('https://medium.com/notifi/some-article-title-abc123', {
        teamName: 'Notifi',
        website: 'https://notifi.network/',
      });
      expect(verdict?.note).toBe('name in blog handle');
    });

    it('medium reserved route `/tag/<x>` does NOT extract as a slug', () => {
      const verdict = corroborateBlog('https://medium.com/tag/notifi', {
        teamName: 'Notifi',
        website: 'https://notifi.network/',
      });
      // First segment is "tag", which is reserved — handle returns null,
      // falls through to host-name check (`medium.com` first-label `medium`
      // doesn't match team token `notifi`) → no verdict.
      expect(verdict).toBeNull();
    });

    it('medium @-handle still works for user profiles', () => {
      const verdict = corroborateBlog('https://medium.com/@notifi', {
        teamName: 'Notifi',
        website: 'https://notifi.network/',
      });
      expect(verdict?.note).toBe('name in blog handle');
    });

    // Bench case (SmartFunds): medium.com/smart-money-defi-studio for team
    // "Smart Money (SmartFunds)". Team tokenizes to ['smart','money','smartfunds'].
    // Publication slug `smart-money-defi-studio` starts with team token
    // 'smart' → `name in blog handle` fires. Auto-promotes without needing
    // the user-trusted fallback.
    it('medium publication hyphenated slug starting with team token → name in blog handle', () => {
      const verdict = corroborateBlog('https://medium.com/smart-money-defi-studio', {
        teamName: 'Smart Money (SmartFunds)',
        website: 'https://www.smartfunds.xyz/',
      });
      expect(verdict?.note).toBe('name in blog handle');
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
    });

    it('user-supplied custom-domain blog (not on platform) with no name match → user trusted', () => {
      const verdict = corroborateBlog(
        'https://random-team-blog.example.org/',
        { teamName: 'Acme', website: 'https://acme.com' },
        { isUserOwned: true }
      );
      expect(verdict?.note).toBe('user trusted');
      expect(verdict?.confidence).toBe(FieldConfidence.High);
    });

    // Bench case (Phas3): Mirror.xyz blog whose publication slug is the
    // team's wallet address (`mirror.xyz/0x8b26…`) — by construction the
    // slug is not name-matchable, but the team admin manually set it. Trust
    // the user's authority over the team's own on-chain blog.
    it('user-supplied Mirror.xyz with wallet-address slug → user trusted', () => {
      const verdict = corroborateBlog(
        'https://mirror.xyz/0x8b2622EEA6ca1cD84423a63DD551bAC913BAc932',
        { teamName: 'Phas3', website: 'https://www.phas3.io/' },
        { isUserOwned: true }
      );
      expect(verdict?.note).toBe('user trusted');
      expect(verdict?.verdict).toBe(JudgmentVerdict.Agrees);
      expect(verdict?.confidence).toBe(FieldConfidence.High);
    });

    it('AI-supplied 3rd-party platform blog with unrelated handle → no verdict (still review)', () => {
      // Symmetric safety: AI-supplied substack/medium with a handle that
      // doesn't match the team token is exactly the failure mode we want
      // admin to catch. Only ChangedByUser values trigger user-trusted on
      // 3rd-party platforms.
      const verdict = corroborateBlog(
        'https://wrong-team-blog.substack.com/',
        { teamName: 'Acme', website: 'https://acme.com' },
        { isUserOwned: false }
      );
      expect(verdict).toBeNull();
    });

    it('user-supplied 3rd-party platform blog with unrelated handle → user trusted', () => {
      const verdict = corroborateBlog(
        'https://archival-handle.substack.com/',
        { teamName: 'Acme', website: 'https://acme.com' },
        { isUserOwned: true }
      );
      expect(verdict?.note).toBe('user trusted');
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

    it('user-supplied website with no deterministic anchor and reachable → user trusted', () => {
      const verdict = corroborateWebsite(
        'https://team-product.io',
        { teamName: 'Acme Robotics', websiteReachable: true },
        { isUserOwned: true }
      );
      expect(verdict?.note).toBe('user trusted');
      expect(verdict?.confidence).toBe(FieldConfidence.High);
    });

    it('user-supplied website that is definitively unreachable → no verdict (hard disprove gate)', () => {
      const verdict = corroborateWebsite(
        'https://broken.example.com',
        { teamName: 'Acme', websiteReachable: false },
        { isUserOwned: true }
      );
      expect(verdict).toBeNull();
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
    it('scrapingdog + high (default / linkedin field) → agrees+high (sourced from linkedin)', () => {
      const v = corroborateBySource(EnrichmentSource.ScrapingDog, 'high', 'linkedinHandler');
      expect(v?.note).toBe('sourced from linkedin');
      expect(v?.judgedVia).toBe(JudgmentSource.Corroboration);
    });

    // `twitterHandler` with source=scrapingdog can only come from the X
    // profile endpoint (LinkedIn's company-profile fetcher never writes
    // twitterHandler). Note reflects the actual upstream so admin reviewers
    // can trust the provenance string.
    it('scrapingdog + high on twitterHandler → sourced from x', () => {
      const v = corroborateBySource(EnrichmentSource.ScrapingDog, 'high', 'twitterHandler');
      expect(v?.note).toBe('sourced from x');
    });

    it('scrapingdog + high on telegramHandler → sourced from telegram', () => {
      const v = corroborateBySource(EnrichmentSource.ScrapingDog, 'high', 'telegramHandler');
      expect(v?.note).toBe('sourced from telegram');
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

    // Liveness veto: source-trust is metadata-only and can't see if the URL
    // is still live. For `website`, the judge's reachability probe gets a
    // veto when it returns definitive 4xx/5xx — otherwise stale enrichment-
    // time provenance would keep a dead site at agrees+high forever.
    it('website + definitive 4xx/5xx (reachable=false) vetoes source-trust', () => {
      const v = corroborateBySource(EnrichmentSource.ScrapingDog, 'high', 'website', {
        teamName: 'Acme',
        websiteReachable: false,
      });
      expect(v).toBeNull();
    });

    it('website + reachable=true allows source-trust', () => {
      const v = corroborateBySource(EnrichmentSource.ScrapingDog, 'high', 'website', {
        teamName: 'Acme',
        websiteReachable: true,
      });
      expect(v?.note).toBe('sourced from linkedin');
    });

    it('website + reachable=null (bot-block / unknown) allows source-trust', () => {
      // 403/429 etc. mean the site is almost certainly alive in a browser —
      // our probe just looks like a bot. Don't veto on these.
      const v = corroborateBySource(EnrichmentSource.OpenGraph, 'high', 'website', {
        teamName: 'Acme',
        websiteReachable: null,
      });
      expect(v?.note).toBe('sourced from website');
    });

    it('non-website field is unaffected by website reachability', () => {
      // The veto is website-specific; other fields don't have a reachability
      // signal at Stage 1.5.
      const v = corroborateBySource(EnrichmentSource.ScrapingDog, 'high', 'linkedinHandler', {
        teamName: 'Acme',
        websiteReachable: false,
      });
      expect(v?.note).toBe('sourced from linkedin');
    });
  });
});
