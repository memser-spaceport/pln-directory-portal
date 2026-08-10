import { buildMemberExperienceInputs, parseLinkedinDateString } from './member-enrichment-experience.util';
import { ScrapingDogPersonProfile } from '../husky/member-scrapingdog.service';

describe('parseLinkedinDateString', () => {
  it('parses "Mon YYYY"', () => {
    expect(parseLinkedinDateString('Oct 2024')).toEqual(new Date(Date.UTC(2024, 9, 1)));
    expect(parseLinkedinDateString('Jan 2014')).toEqual(new Date(Date.UTC(2014, 0, 1)));
  });

  it('parses a bare year', () => {
    expect(parseLinkedinDateString('2013')).toEqual(new Date(Date.UTC(2013, 0, 1)));
  });

  it('treats "Present"/"Current" as no date', () => {
    expect(parseLinkedinDateString('Present')).toBeNull();
    expect(parseLinkedinDateString('current')).toBeNull();
  });

  it('returns null for missing or unparseable input', () => {
    expect(parseLinkedinDateString(null)).toBeNull();
    expect(parseLinkedinDateString(undefined)).toBeNull();
    expect(parseLinkedinDateString('')).toBeNull();
    expect(parseLinkedinDateString('sometime in the past')).toBeNull();
  });
});

describe('buildMemberExperienceInputs', () => {
  it('maps a parseable ongoing entry to isCurrent: true with a null endDate', () => {
    const experiences: ScrapingDogPersonProfile['experiences'] = [
      {
        title: 'Software Engineer',
        company: 'Non-Disclosure Agreement',
        location: null,
        duration: '1 year 1 month',
        summary: 'Build and deploy smart contracts.',
        startsAt: 'Oct 2024',
        endsAt: 'Present',
      },
    ];

    const inputs = buildMemberExperienceInputs(experiences, 'member-1');

    expect(inputs).toEqual([
      {
        title: 'Software Engineer',
        company: 'Non-Disclosure Agreement',
        location: null,
        description: 'Build and deploy smart contracts.',
        startDate: new Date(Date.UTC(2024, 9, 1)),
        endDate: null,
        isCurrent: true,
        memberUid: 'member-1',
      },
    ]);
  });

  it('maps a closed-ended entry to isCurrent: false with a real endDate', () => {
    const experiences: ScrapingDogPersonProfile['experiences'] = [
      {
        title: 'Software Engineer',
        company: 'Mode Network',
        location: null,
        duration: '6 months',
        summary: null,
        startsAt: 'May 2024',
        endsAt: 'Oct 2024',
      },
    ];

    const inputs = buildMemberExperienceInputs(experiences, 'member-1');

    expect(inputs[0]).toMatchObject({
      startDate: new Date(Date.UTC(2024, 4, 1)),
      endDate: new Date(Date.UTC(2024, 9, 1)),
      isCurrent: false,
    });
  });

  it('skips entries with no parseable start date instead of guessing', () => {
    const experiences: ScrapingDogPersonProfile['experiences'] = [
      {
        title: 'Freelancer',
        company: 'Self',
        location: null,
        duration: null,
        summary: null,
        startsAt: null,
        endsAt: null,
      },
    ];

    expect(buildMemberExperienceInputs(experiences, 'member-1')).toEqual([]);
  });

  it('falls back title/company to empty string, never null, to satisfy the required schema columns', () => {
    const experiences: ScrapingDogPersonProfile['experiences'] = [
      {
        title: null,
        company: 'Acme',
        location: null,
        duration: null,
        summary: null,
        startsAt: '2020',
        endsAt: null,
      },
    ];

    expect(buildMemberExperienceInputs(experiences, 'member-1')[0].title).toBe('');
  });
});
