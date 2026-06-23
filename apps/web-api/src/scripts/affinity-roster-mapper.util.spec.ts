import {
  extractInteraction,
  extractPersonRef,
  hasAffinityData,
  mapAffinityListEntry,
  mapCheckSizeUsd,
  mapInvestorType,
  mapStagePreference,
  mergeProfileFields,
  type AffinityListField,
} from './affinity-roster-mapper.util';

const field = (id: string, name: string, data: unknown): AffinityListField => ({
  id,
  name,
  value: { data },
});

describe('mapInvestorType', () => {
  it('maps family office and HNWI', () => {
    expect(mapInvestorType('Family Office', null)).toBe('family_office');
    expect(mapInvestorType('HNWI', null)).toBe('angel');
    expect(mapInvestorType(null, 'Fund')).toBe('fund');
  });
});

describe('mapCheckSizeUsd', () => {
  it('buckets USD amounts', () => {
    expect(mapCheckSizeUsd(50_000)).toBe('<100K');
    expect(mapCheckSizeUsd(500_000)).toBe('500K-1M');
    expect(mapCheckSizeUsd(10_000_000)).toBe('5M+');
  });
});

describe('mapStagePreference', () => {
  it('maps stage strings', () => {
    expect(mapStagePreference('Pre-seed')).toBe('pre-seed');
    expect(mapStagePreference('Series A')).toBe('series-a');
    expect(mapStagePreference('growth')).toBe('series-b+');
  });
});

describe('extractInteraction', () => {
  it('parses email interaction with subject and from person', () => {
    const f = field('last-contact', 'Last Contact', {
      id: 1,
      type: 'email',
      subject: 'Demo Day reminder',
      sentAt: '2026-06-08T11:31:18Z',
      from: {
        emailAddress: 'marc@plrs.xyz',
        person: {
          id: 253405047,
          firstName: 'Marc',
          lastName: 'Johnson',
          primaryEmailAddress: 'marc@plrs.xyz',
        },
      },
    });
    const out = extractInteraction(f, { byEmail: (e) => (e === 'marc@plrs.xyz' ? 'uid-marc' : undefined) });
    expect(out?.method).toBe('email');
    expect(out?.subject).toBe('Demo Day reminder');
    expect(out?.from?.memberUid).toBe('uid-marc');
  });
});

describe('extractPersonRef', () => {
  it('parses person ref for source of introduction', () => {
    const f = field('source-of-introduction', 'Source of Introduction', {
      id: 118269819,
      firstName: 'Brad',
      lastName: 'Holden',
      primaryEmailAddress: 'brad@protocol.vc',
    });
    expect(extractPersonRef(f)?.name).toBe('Brad Holden');
  });

  it('parses text key contact', () => {
    const f = field('field-5577222', 'Key Contact (Relationship owner)', 'Brad');
    expect(extractPersonRef(f, { byName: (n) => (n === 'Brad' ? 'uid-brad' : undefined) })?.memberUid).toBe('uid-brad');
  });
});

describe('mergeProfileFields', () => {
  it('keeps existing columns and fills empty from affinity', () => {
    const merged = mergeProfileFields(
      { title: 'CEO', investorType: 'angel', stageFocus: 'seed' },
      { title: 'GP', linkedinUrl: 'https://linkedin.com/in/jane', investorType: 'fund' }
    );
    expect(merged.title).toBe('CEO');
    expect(merged.linkedinUrl).toBe('https://linkedin.com/in/jane');
    expect(merged.investorType).toBe('angel');
    expect(merged.stageFocus).toBe('seed');
  });
});

describe('mapAffinityListEntry', () => {
  it('returns empty objects for bare entity', () => {
    const { profile, affinityData } = mapAffinityListEntry({ fields: [] });
    expect(profile).toEqual({});
    expect(hasAffinityData(affinityData)).toBe(false);
  });

  it('maps profile fallbacks and affinityData from fields', () => {
    const { profile, affinityData } = mapAffinityListEntry({
      fields: [
        field('affinity-data-linkedin-url', 'LinkedIn URL', 'https://linkedin.com/in/jane'),
        field('affinity-data-current-job-title', 'Current Job Title', 'General Partner'),
        field('affinity-data-location', 'Location', { city: 'San Francisco', state: 'California', country: 'US' }),
        field('field-5750375', 'LP Type', { text: 'Family Office' }),
        field('affinity-data-industry', 'Industry', ['Financial Services']),
        field('field-5750415', 'LP Stage', { text: 'Contacted' }),
        field('companies', 'Organizations', [{ name: 'Acme', domain: 'acme.com' }]),
        field('last-email', 'Last Email', {
          type: 'email',
          sentAt: '2026-03-01T00:00:00Z',
          subject: 'Hello',
        }),
      ],
    });
    expect(profile.linkedinUrl).toBe('https://linkedin.com/in/jane');
    expect(profile.title).toBe('General Partner');
    expect(profile.geoFocus).toContain('San Francisco');
    expect(profile.investorType).toBe('family_office');
    expect(profile.firmDomain).toBe('acme.com');
    expect(affinityData.lpStage).toBe('Contacted');
    expect(affinityData.lastEmail?.date).toBe('2026-03-01T00:00:00Z');
    expect(hasAffinityData(affinityData)).toBe(true);
  });
});
