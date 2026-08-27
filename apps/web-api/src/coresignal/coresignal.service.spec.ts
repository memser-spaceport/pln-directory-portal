import { CoresignalService } from './coresignal.service';

/**
 * Unit-tests the pure bits of `CoresignalService` (identifier extraction,
 * payload normalization) plus the configured/HTTP-call-shaped branches. The
 * profile fixture mirrors the Clean Employee API's documented data
 * dictionary (values abridged, keys verbatim) — if Coresignal renames a key
 * upstream this test should fail loudly, same precedent as
 * member-scrapingdog.service.spec.ts.
 */
describe('CoresignalService', () => {
  const originalApiKey = process.env.CORESIGNAL_API_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.CORESIGNAL_API_KEY = originalApiKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const service = () => new CoresignalService();
  const asAny = (s: CoresignalService) =>
    s as unknown as {
      extractIdentifier(handler: string): string | null;
      normalizeProfile(raw: Record<string, unknown>): unknown;
    };

  describe('extractIdentifier', () => {
    it('parses a linkedin.com/in URL', () => {
      expect(asAny(service()).extractIdentifier('https://www.linkedin.com/in/mykyta-shevelov-78338450/')).toBe(
        'mykyta-shevelov-78338450'
      );
    });
    it('accepts a bare slug and strips an in/ prefix', () => {
      expect(asAny(service()).extractIdentifier('mykyta-shevelov-78338450')).toBe('mykyta-shevelov-78338450');
      expect(asAny(service()).extractIdentifier('in/mykyta-shevelov-78338450')).toBe('mykyta-shevelov-78338450');
    });
    it('rejects empty input', () => {
      expect(asAny(service()).extractIdentifier('')).toBeNull();
      expect(asAny(service()).extractIdentifier('   ')).toBeNull();
    });
  });

  describe('normalizeProfile', () => {
    const realShape = {
      full_name: 'Mykyta Shevelov',
      first_name: 'Mykyta',
      last_name: 'Shevelov',
      linkedin_canonical_shorthand_name: 'mykyta-shevelov-78338450',
      linkedin_shorthand_names: ['mykyta-shevelov-78338450'],
      headline: 'Java backend | Web3',
      summary: null,
      location: 'Spain',
      experience: [
        {
          order_in_profile: 2,
          title: 'Software Engineer at Mode',
          company_name: 'Mode Network',
          location: 'Singapore',
          description: 'Cryptocurrency project.',
          date_from: '2024-05-01',
          date_from_year: 2024,
          date_from_month: 5,
          date_to: '2024-10-01',
          date_to_year: 2024,
          date_to_month: 10,
          is_current: false,
        },
        {
          order_in_profile: 1,
          title: 'Software Engineer',
          company_name: 'Non-Disclosure Agreement',
          location: null,
          description: 'Build and deploy smart contracts.',
          date_from: '2024-10-01',
          date_from_year: 2024,
          date_from_month: 10,
          date_to: null,
          date_to_year: null,
          date_to_month: null,
          is_current: true,
        },
      ],
      education: [{ institution_name: 'Odessa State Polytechnic University', degree: 'Master, Software Engineering' }],
    };

    it('normalizes the real response shape and sorts experience by order_in_profile', () => {
      const profile = asAny(service()).normalizeProfile(realShape) as any;
      expect(profile.fullName).toBe('Mykyta Shevelov');
      expect(profile.firstName).toBe('Mykyta');
      expect(profile.publicIdentifier).toBe('mykyta-shevelov-78338450');
      expect(profile.headline).toBe('Java backend | Web3');
      expect(profile.location).toBe('Spain');
      expect(profile.about).toBeNull();
      // order_in_profile: 1 (current position) sorts before order_in_profile: 2, even
      // though it appears second in the raw array.
      expect(profile.experiences).toEqual([
        {
          title: 'Software Engineer',
          company: 'Non-Disclosure Agreement',
          location: null,
          duration: 'Oct 2024 - Present',
          summary: 'Build and deploy smart contracts.',
          startsAt: 'Oct 2024',
          endsAt: null,
        },
        {
          title: 'Software Engineer at Mode',
          company: 'Mode Network',
          location: 'Singapore',
          duration: 'May 2024 - Oct 2024',
          summary: 'Cryptocurrency project.',
          startsAt: 'May 2024',
          endsAt: 'Oct 2024',
        },
      ]);
      expect(profile.education).toEqual(['Odessa State Polytechnic University — Master, Software Engineering']);
    });

    it('skips empty entries and tolerates a missing experience array', () => {
      const profile = asAny(service()).normalizeProfile({ full_name: 'Jane Doe' }) as any;
      expect(profile.fullName).toBe('Jane Doe');
      expect(profile.experiences).toEqual([]);
      expect(profile.education).toEqual([]);
    });
  });

  describe('fetchEmployeeProfile', () => {
    it('returns not-configured and makes no HTTP call when no API key is set', async () => {
      delete process.env.CORESIGNAL_API_KEY;
      const fetchSpy = jest.fn();
      global.fetch = fetchSpy as any;

      const result = await service().fetchEmployeeProfile('mykyta-shevelov-78338450');

      expect(result).toEqual({ kind: 'not-configured' });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns not-found on HTTP 404', async () => {
      process.env.CORESIGNAL_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404 }) as any;

      const result = await service().fetchEmployeeProfile('someone');

      expect(result).toEqual({ kind: 'not-found' });
    });

    it('returns an error on a non-404 failure status', async () => {
      process.env.CORESIGNAL_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as any;

      const result = await service().fetchEmployeeProfile('someone');

      expect(result).toEqual({ kind: 'error', reason: 'HTTP 500' });
    });

    it('returns ok with a normalized profile on success, calling only the /collect endpoint', async () => {
      process.env.CORESIGNAL_API_KEY = 'test-key';
      const fetchSpy = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ full_name: 'Jane Doe', experience: [{ title: 'CTO', company_name: 'Acme' }] }),
      });
      global.fetch = fetchSpy as any;

      const result = await service().fetchEmployeeProfile('jane-doe');

      expect(result.kind).toBe('ok');
      if (result.kind === 'ok') {
        expect(result.profile.fullName).toBe('Jane Doe');
      }
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [calledUrl] = fetchSpy.mock.calls[0];
      expect(calledUrl).toContain('/employee_clean/collect/jane-doe');
      expect(calledUrl).not.toContain('/search');
    });

    it('returns not-found when the profile has no name and no experience (empty shell)', async () => {
      process.env.CORESIGNAL_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }) as any;

      const result = await service().fetchEmployeeProfile('someone');

      expect(result).toEqual({ kind: 'not-found' });
    });
  });

  describe('isConfigured', () => {
    it('reflects CORESIGNAL_API_KEY presence', () => {
      process.env.CORESIGNAL_API_KEY = 'test-key';
      expect(service().isConfigured()).toBe(true);
      delete process.env.CORESIGNAL_API_KEY;
      expect(service().isConfigured()).toBe(false);
    });
  });
});
