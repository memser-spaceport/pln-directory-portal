import { buildMemberEnrichmentEligibilityFilter } from './member-enrichment-eligibility-filter';

describe('buildMemberEnrichmentEligibilityFilter', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('defaults to isInvestor OR fund-team-member OR priority 1/2/3 when env vars are unset', () => {
    delete process.env.MEMBER_ENRICHMENT_FILTER_PRIORITY;
    delete process.env.MEMBER_ENRICHMENT_FILTER_IS_FUND;

    const filter = buildMemberEnrichmentEligibilityFilter();

    expect(filter).toEqual({
      AND: [
        { deletedAt: null },
        {
          OR: [
            { isInvestor: true },
            { teamMemberRoles: { some: { team: { isFund: true } } } },
            { teamMemberRoles: { some: { team: { priority: { in: [1, 2, 3] } } } } },
          ],
        },
      ],
    });
  });

  it('drops the fund clause when MEMBER_ENRICHMENT_FILTER_IS_FUND=false', () => {
    process.env.MEMBER_ENRICHMENT_FILTER_IS_FUND = 'false';
    process.env.MEMBER_ENRICHMENT_FILTER_PRIORITY = '1,2,3';

    const filter = buildMemberEnrichmentEligibilityFilter();

    expect(filter).toEqual({
      AND: [
        { deletedAt: null },
        { OR: [{ isInvestor: true }, { teamMemberRoles: { some: { team: { priority: { in: [1, 2, 3] } } } } }] },
      ],
    });
  });

  it('drops the priority clause when MEMBER_ENRICHMENT_FILTER_PRIORITY is empty', () => {
    process.env.MEMBER_ENRICHMENT_FILTER_PRIORITY = '';
    process.env.MEMBER_ENRICHMENT_FILTER_IS_FUND = 'true';

    const filter = buildMemberEnrichmentEligibilityFilter();

    expect(filter).toEqual({
      AND: [
        { deletedAt: null },
        { OR: [{ isInvestor: true }, { teamMemberRoles: { some: { team: { isFund: true } } } }] },
      ],
    });
  });

  it('narrows priority to a custom list', () => {
    process.env.MEMBER_ENRICHMENT_FILTER_PRIORITY = '1';
    process.env.MEMBER_ENRICHMENT_FILTER_IS_FUND = 'false';

    const filter = buildMemberEnrichmentEligibilityFilter();

    expect(filter).toEqual({
      AND: [
        { deletedAt: null },
        { OR: [{ isInvestor: true }, { teamMemberRoles: { some: { team: { priority: { in: [1] } } } } }] },
      ],
    });
  });

  it('is case-insensitive for the IS_FUND flag and ignores non-integer priority tokens', () => {
    process.env.MEMBER_ENRICHMENT_FILTER_IS_FUND = 'TRUE';
    process.env.MEMBER_ENRICHMENT_FILTER_PRIORITY = '1, abc, 3';

    const filter = buildMemberEnrichmentEligibilityFilter();

    expect(filter).toEqual({
      AND: [
        { deletedAt: null },
        {
          OR: [
            { isInvestor: true },
            { teamMemberRoles: { some: { team: { isFund: true } } } },
            { teamMemberRoles: { some: { team: { priority: { in: [1, 3] } } } } },
          ],
        },
      ],
    });
  });

  it('always includes isInvestor:true even when both filters are disabled', () => {
    process.env.MEMBER_ENRICHMENT_FILTER_IS_FUND = 'false';
    process.env.MEMBER_ENRICHMENT_FILTER_PRIORITY = '';

    const filter = buildMemberEnrichmentEligibilityFilter();

    expect(filter).toEqual({ AND: [{ deletedAt: null }, { OR: [{ isInvestor: true }] }] });
  });

  it('excludes rejected (soft-deleted) members regardless of which env vars are set', () => {
    const filter = buildMemberEnrichmentEligibilityFilter();

    expect(filter.AND).toContainEqual({ deletedAt: null });
  });
});
