import { isLikelyValueForField } from './team-enrichment-field-shape.util';

describe('isLikelyValueForField', () => {
  describe('website / blog', () => {
    for (const field of ['website', 'blog'] as const) {
      it(`${field}: accepts http/https URL with valid host`, () => {
        expect(isLikelyValueForField(field, 'https://acme.com')).toBe(true);
        expect(isLikelyValueForField(field, 'http://blog.acme.com/posts')).toBe(true);
        expect(isLikelyValueForField(field, 'https://acme.com/path?q=1')).toBe(true);
      });

      it(`${field}: rejects schemeless URL`, () => {
        expect(isLikelyValueForField(field, 'acme.com')).toBe(false);
        expect(isLikelyValueForField(field, 't54.ai')).toBe(false);
      });

      it(`${field}: rejects free-text placeholders`, () => {
        expect(isLikelyValueForField(field, 'Coming soon!')).toBe(false);
        expect(isLikelyValueForField(field, 'TBD')).toBe(false);
        expect(isLikelyValueForField(field, 'n/a')).toBe(false);
        expect(isLikelyValueForField(field, 'pending')).toBe(false);
      });

      it(`${field}: rejects empty / whitespace`, () => {
        expect(isLikelyValueForField(field, '')).toBe(false);
        expect(isLikelyValueForField(field, '   ')).toBe(false);
      });
    }
  });

  describe('contactMethod', () => {
    it('accepts email', () => {
      expect(isLikelyValueForField('contactMethod', 'info@acme.com')).toBe(true);
      expect(isLikelyValueForField('contactMethod', 'hello@team.example.org')).toBe(true);
    });

    it('accepts URL with scheme', () => {
      expect(isLikelyValueForField('contactMethod', 'https://discord.gg/xyz')).toBe(true);
      expect(isLikelyValueForField('contactMethod', 'https://calendly.com/acme')).toBe(true);
      expect(isLikelyValueForField('contactMethod', 'https://acme.com/#')).toBe(true);
    });

    it('accepts mailto:', () => {
      expect(isLikelyValueForField('contactMethod', 'mailto:hello@acme.com')).toBe(true);
    });

    it('accepts @handle', () => {
      expect(isLikelyValueForField('contactMethod', '@acme_team')).toBe(true);
    });

    it('rejects field-label placeholders (the bench cases)', () => {
      // Real ChangedByUser values from prod: AI Objectives Institute / GainForest
      // entered "email", T54 entered "Twitter", Crecimiento entered "Telegram".
      expect(isLikelyValueForField('contactMethod', 'email')).toBe(false);
      expect(isLikelyValueForField('contactMethod', 'Twitter')).toBe(false);
      expect(isLikelyValueForField('contactMethod', 'Telegram')).toBe(false);
      expect(isLikelyValueForField('contactMethod', 'phone')).toBe(false);
    });

    it('rejects free-text placeholders', () => {
      expect(isLikelyValueForField('contactMethod', 'Coming soon!')).toBe(false);
      expect(isLikelyValueForField('contactMethod', 'TBD')).toBe(false);
      expect(isLikelyValueForField('contactMethod', 'n/a')).toBe(false);
    });
  });

  describe('twitterHandler', () => {
    it('accepts short legit handles (with and without @)', () => {
      // Bench cases: @EFF, @Celo, @safe, @bluesky.
      expect(isLikelyValueForField('twitterHandler', '@EFF')).toBe(true);
      expect(isLikelyValueForField('twitterHandler', 'EFF')).toBe(true);
      expect(isLikelyValueForField('twitterHandler', '@privy_io')).toBe(true);
      expect(isLikelyValueForField('twitterHandler', 'transcrypts_')).toBe(true);
    });

    it('accepts full twitter/x URLs', () => {
      expect(isLikelyValueForField('twitterHandler', 'https://twitter.com/acme')).toBe(true);
      expect(isLikelyValueForField('twitterHandler', 'https://x.com/acme/')).toBe(true);
    });

    it('rejects handles >15 chars', () => {
      expect(isLikelyValueForField('twitterHandler', 'thisIsWayTooLongForTwitter')).toBe(false);
    });

    it('rejects handles with disallowed chars', () => {
      expect(isLikelyValueForField('twitterHandler', '@acme-team')).toBe(false); // hyphen
      expect(isLikelyValueForField('twitterHandler', 'acme team')).toBe(false); // space
    });

    it('rejects free-text placeholders', () => {
      expect(isLikelyValueForField('twitterHandler', 'Coming soon!')).toBe(false);
      expect(isLikelyValueForField('twitterHandler', 'n/a')).toBe(false);
    });
  });

  describe('linkedinHandler', () => {
    it('accepts `company/<slug>` form', () => {
      expect(isLikelyValueForField('linkedinHandler', 'company/acme-labs')).toBe(true);
      expect(isLikelyValueForField('linkedinHandler', 'school/mit')).toBe(true);
      expect(isLikelyValueForField('linkedinHandler', 'in/john-doe')).toBe(true);
    });

    it('accepts full linkedin URLs', () => {
      expect(
        isLikelyValueForField('linkedinHandler', 'https://www.linkedin.com/company/eon-systems-pbc/')
      ).toBe(true);
    });

    it('accepts bare slug', () => {
      expect(isLikelyValueForField('linkedinHandler', 'acme-labs')).toBe(true);
    });

    it('rejects free-text placeholders', () => {
      expect(isLikelyValueForField('linkedinHandler', 'Coming soon!')).toBe(false);
      expect(isLikelyValueForField('linkedinHandler', 'n/a')).toBe(false);
    });
  });

  describe('telegramHandler', () => {
    it('accepts short handle (with or without @)', () => {
      expect(isLikelyValueForField('telegramHandler', '@msourial')).toBe(true);
      expect(isLikelyValueForField('telegramHandler', 'fileverse')).toBe(true);
      expect(isLikelyValueForField('telegramHandler', 'ranjan3118')).toBe(true);
    });

    it('accepts t.me URLs', () => {
      expect(isLikelyValueForField('telegramHandler', 'https://t.me/acmechat')).toBe(true);
    });

    it('rejects too-short handle', () => {
      expect(isLikelyValueForField('telegramHandler', '@ab')).toBe(false); // 2 chars
    });

    it('rejects free-text placeholders', () => {
      expect(isLikelyValueForField('telegramHandler', 'Coming soon!')).toBe(false);
      expect(isLikelyValueForField('telegramHandler', 'n/a')).toBe(false);
    });
  });

  describe('fields without a shape gate', () => {
    it('shortDescription / longDescription / moreDetails always pass non-empty values', () => {
      expect(isLikelyValueForField('shortDescription', 'A short blurb about the company.')).toBe(true);
      expect(isLikelyValueForField('longDescription', 'A long blurb.')).toBe(true);
      expect(isLikelyValueForField('moreDetails', 'Founded 2010 in Cambridge.')).toBe(true);
    });

    it('rejects empty values uniformly', () => {
      expect(isLikelyValueForField('shortDescription', '')).toBe(false);
      expect(isLikelyValueForField('moreDetails', '   ')).toBe(false);
    });
  });
});
