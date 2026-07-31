import { MemberScrapingDogService, ScrapingDogPersonProfile } from './member-scrapingdog.service';

/**
 * Unit-tests the pure bits of `MemberScrapingDogService` (handle extraction,
 * payload normalization). The person-profile fixture mirrors a REAL
 * `/profile?type=profile` response captured on 2026-07-22 — if ScrapingDog
 * renames a key upstream this test should fail loudly.
 */
describe('MemberScrapingDogService', () => {
  const service = new MemberScrapingDogService();
  const asAny = () =>
    service as unknown as {
      extractPersonHandleId(handler: string): string | null;
      extractXHandle(handler: string): string | null;
      normalizePersonProfile(raw: Record<string, unknown>): ScrapingDogPersonProfile;
      isNotFoundBody(raw: unknown): boolean;
    };

  describe('extractPersonHandleId', () => {
    it('parses a linkedin.com/in URL', () => {
      expect(asAny().extractPersonHandleId('https://www.linkedin.com/in/mykyta-shevelov-78338450/')).toBe(
        'mykyta-shevelov-78338450'
      );
    });
    it('accepts a bare slug and strips an in/ prefix', () => {
      expect(asAny().extractPersonHandleId('mykyta-shevelov-78338450')).toBe('mykyta-shevelov-78338450');
      expect(asAny().extractPersonHandleId('in/mykyta-shevelov-78338450')).toBe('mykyta-shevelov-78338450');
    });
    it('accepts percent-encoded unicode slugs', () => {
      expect(asAny().extractPersonHandleId('https://linkedin.com/in/%E5%BC%A0%E4%B8%89-zhang')).toBe(
        '%E5%BC%A0%E4%B8%89-zhang'
      );
    });
    it('rejects a company URL (person fetch must not scrape companies)', () => {
      expect(asAny().extractPersonHandleId('https://www.linkedin.com/company/acme')).toBeNull();
    });
    it('rejects empty input', () => {
      expect(asAny().extractPersonHandleId('')).toBeNull();
      expect(asAny().extractPersonHandleId('   ')).toBeNull();
    });
  });

  describe('extractXHandle', () => {
    it('strips @ and parses x.com / twitter.com URLs', () => {
      expect(asAny().extractXHandle('@someone_')).toBe('someone_');
      expect(asAny().extractXHandle('https://x.com/someone_/with_replies')).toBe('someone_');
      expect(asAny().extractXHandle('https://twitter.com/someone_')).toBe('someone_');
    });
    it('rejects invalid X usernames', () => {
      expect(asAny().extractXHandle('has-hyphen')).toBeNull();
      expect(asAny().extractXHandle('aaaaaaaaaaaaaaaa')).toBeNull();
      expect(asAny().extractXHandle('')).toBeNull();
    });
  });

  describe('normalizePersonProfile', () => {
    // Real response shape from GET https://api.scrapingdog.com/profile?type=profile
    // (values abridged, keys verbatim).
    const realShape = {
      fullName: 'Mykyta Shevelov',
      linkedin_internal_id: '180079443',
      first_name: 'Mykyta',
      last_name: 'Shevelov',
      public_identifier: 'mykyta-shevelov-78338450',
      background_cover_image_url: 'https://static.licdn.com/x',
      profile_photo: 'https://media.licdn.com/y',
      headline: 'Java backend | Web3',
      location: 'Argentina',
      followers: '100 followers',
      connections: '94 connections',
      about: '',
      experience: [
        {
          position: 'Senior Java Developer',
          company_url: 'https://linkedin.com/company/acme',
          company_image: 'https://media.licdn.com/z',
          company_name: 'Acme',
          location: null,
          summary: 'Backend services.',
          starts_at: 'Jan 2020',
          ends_at: 'Present',
          duration: '6 years',
        },
      ],
      education: [
        {
          college_url: 'https://linkedin.com/school/odesa-polytechnic/',
          college_name: 'Odessa State Polytechnic University',
          college_image: '',
          college_degree: 'Master',
          college_degree_field: 'Computer Science',
          college_duration: '2008 - 2013',
          college_activity: '',
        },
      ],
      articles: [],
      description: { description1: 'Non-Disclosure Agreement' },
      activities: [],
    };

    it('normalizes the real response shape', () => {
      const profile = asAny().normalizePersonProfile(realShape);
      expect(profile.fullName).toBe('Mykyta Shevelov');
      expect(profile.firstName).toBe('Mykyta');
      expect(profile.lastName).toBe('Shevelov');
      expect(profile.publicIdentifier).toBe('mykyta-shevelov-78338450');
      expect(profile.headline).toBe('Java backend | Web3');
      expect(profile.location).toBe('Argentina');
      // Empty-string about must normalize to null, not ''.
      expect(profile.about).toBeNull();
      expect(profile.experiences).toEqual([
        {
          title: 'Senior Java Developer',
          company: 'Acme',
          location: null,
          duration: '6 years',
          summary: 'Backend services.',
        },
      ]);
      expect(profile.education).toEqual(['Odessa State Polytechnic University — Master, Computer Science']);
    });

    it('builds duration from starts_at/ends_at when duration is missing', () => {
      const profile = asAny().normalizePersonProfile({
        fullName: 'Jane Doe',
        experience: [{ position: 'CTO', company_name: 'Beta', starts_at: 'Jan 2020', ends_at: '' }],
      });
      expect(profile.experiences[0].duration).toBe('Jan 2020 - Present');
    });

    it('tolerates key drift (title/company variants) and skips empty entries', () => {
      const profile = asAny().normalizePersonProfile({
        full_name: 'Jane Doe',
        experience: [{ title: 'Advisor', company: 'Beta', duration: '2y' }, { irrelevant: true }, null],
        education: 'not-an-array',
      });
      expect(profile.fullName).toBe('Jane Doe');
      expect(profile.experiences).toEqual([
        { title: 'Advisor', company: 'Beta', location: null, duration: '2y', summary: null },
      ]);
      expect(profile.education).toEqual([]);
    });
  });

  describe('isNotFoundBody', () => {
    it('matches the documented not-found shape and nothing else', () => {
      expect(asAny().isNotFoundBody({ success: false, message: 'Profile not found' })).toBe(true);
      expect(asAny().isNotFoundBody({ success: true })).toBe(false);
      expect(asAny().isNotFoundBody({ fullName: 'Jane' })).toBe(false);
    });
  });
});
