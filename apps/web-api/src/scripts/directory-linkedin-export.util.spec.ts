import {
  buildDirectoryLinkedinExportStats,
  cohortForInvestorListSlug,
  composeInvestorDisplayName,
  deriveLinkedinSlug,
  normalizeMemberExperienceSpan,
} from './directory-linkedin-export.util';

describe('deriveLinkedinSlug', () => {
  it('extracts slug from personal linkedin URLs and handlers', () => {
    expect(deriveLinkedinSlug('https://www.linkedin.com/in/jane-doe/')).toBe('jane-doe');
    expect(deriveLinkedinSlug('in/jane-doe')).toBe('jane-doe');
  });

  it('returns null for company or school handles', () => {
    expect(deriveLinkedinSlug('company/acme-corp')).toBeNull();
    expect(deriveLinkedinSlug('school/stanford-university')).toBeNull();
    expect(deriveLinkedinSlug('acme-corp')).toBeNull();
  });
});

describe('composeInvestorDisplayName', () => {
  it('prefers first and last name', () => {
    expect(
      composeInvestorDisplayName({
        firstName: 'Jane',
        lastName: 'Doe',
        firm: 'Acme',
        investorId: 'inv-1',
      })
    ).toBe('Jane Doe');
  });

  it('falls back to firm then investorId', () => {
    expect(
      composeInvestorDisplayName({
        firstName: '',
        lastName: '',
        firm: 'Acme Capital',
        investorId: 'inv-1',
      })
    ).toBe('Acme Capital');
    expect(
      composeInvestorDisplayName({
        investorId: 'inv-1',
      })
    ).toBe('inv-1');
  });
});

describe('normalizeMemberExperienceSpan', () => {
  it('maps dates to UTC years and nulls endYear when current', () => {
    expect(
      normalizeMemberExperienceSpan({
        company: 'Acme',
        title: 'Engineer',
        startDate: new Date('2019-06-01T00:00:00.000Z'),
        endDate: new Date('2021-12-31T00:00:00.000Z'),
        isCurrent: false,
      })
    ).toEqual({
      company: 'Acme',
      title: 'Engineer',
      startYear: 2019,
      endYear: 2021,
      isCurrent: false,
    });
  });

  it('sets endYear null for open-ended or current roles', () => {
    expect(
      normalizeMemberExperienceSpan({
        company: 'Acme',
        title: 'CTO',
        startDate: new Date('2022-01-15T00:00:00.000Z'),
        endDate: null,
        isCurrent: true,
      })
    ).toEqual({
      company: 'Acme',
      title: 'CTO',
      startYear: 2022,
      endYear: null,
      isCurrent: true,
    });

    expect(
      normalizeMemberExperienceSpan({
        company: 'Beta',
        title: 'Advisor',
        startDate: new Date('2020-03-01T00:00:00.000Z'),
        endDate: new Date('2023-01-01T00:00:00.000Z'),
        isCurrent: true,
      })
    ).toEqual({
      company: 'Beta',
      title: 'Advisor',
      startYear: 2020,
      endYear: null,
      isCurrent: true,
    });
  });
});

describe('cohortForInvestorListSlug', () => {
  it('maps known list slugs to cohorts', () => {
    expect(cohortForInvestorListSlug('neuro-lp')).toBe('neuro');
    expect(cohortForInvestorListSlug('gold-coinvestors')).toBe('gold');
    expect(cohortForInvestorListSlug('other-list')).toBeNull();
  });
});

describe('buildDirectoryLinkedinExportStats', () => {
  it('counts entities with linkedin and employment coverage', () => {
    const stats = buildDirectoryLinkedinExportStats({
      members: [
        {
          uid: 'm1',
          name: 'A',
          email: 'a@example.com',
          linkedinHandler: 'in/a',
          linkedinSlug: 'a',
          teams: [],
          employment: [{ company: 'X', title: 'Y', startYear: 2020, endYear: null, isCurrent: true }],
        },
        {
          uid: 'm2',
          name: 'B',
          email: 'b@example.com',
          linkedinHandler: null,
          linkedinSlug: null,
          teams: [],
          employment: [],
        },
      ],
      investors: [
        {
          investorId: 'i1',
          canonicalId: null,
          name: 'Investor One',
          firm: 'Firm',
          linkedinUrl: 'https://linkedin.com/in/inv-one',
          email: 'i1@example.com',
          cohorts: ['neuro'],
          linkedinSlug: 'inv-one',
        },
        {
          investorId: 'i2',
          canonicalId: null,
          name: 'Investor Two',
          firm: null,
          linkedinUrl: null,
          email: 'i2@example.com',
          cohorts: ['gold'],
          linkedinSlug: null,
        },
      ],
      teams: [
        { teamUid: 't1', name: 'Team', linkedinHandler: 'company/acme', website: null },
        { teamUid: 't2', name: 'Other', linkedinHandler: null, website: null },
      ],
    });

    expect(stats).toEqual({
      memberCount: 2,
      membersWithLinkedin: 1,
      membersWithEmployment: 1,
      investorCount: 2,
      investorsWithLinkedin: 1,
      teamCount: 2,
      teamsWithLinkedin: 1,
    });
  });
});
