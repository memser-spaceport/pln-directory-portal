import { parseTeamsFilters } from './teams-directory-filters.utils';

describe('#parseTeamsFilters', () => {
  it('should parse teams filter values into each filter component`s consumable format', () => {
    expect(
      parseTeamsFilters(
        {
          valuesByFilter: {
            tags: ['Tag 01', 'Tag 02', 'Tag 03'],
            membershipSources: [
              'Membership Source 01',
              'Membership Source 02',
              'Membership Source 03',
            ],
            fundingStage: [
              'Funding Stage 01',
              'Funding Stage 02',
              'Funding Stage 03',
            ],
            technology: ['Filecoin', 'IPFS'],
          },
          availableValuesByFilter: {
            tags: ['Tag 01', 'Tag 03'],
            membershipSources: ['Membership Source 01', 'Membership Source 03'],
            fundingStage: ['Funding Stage 01', 'Funding Stage 02'],
            technology: ['Filecoin'],
          },
        },
        {
          tags: 'Tag 01',
          technology: 'Filecoin',
        }
      )
    ).toEqual({
      tags: [
        { value: 'Tag 01', selected: true, disabled: false },
        { value: 'Tag 02', selected: false, disabled: true },
        { value: 'Tag 03', selected: false, disabled: false },
      ],
      membershipSources: [
        { value: 'Membership Source 01', selected: false, disabled: false },
        { value: 'Membership Source 02', selected: false, disabled: true },
        { value: 'Membership Source 03', selected: false, disabled: false },
      ],
      fundingStage: [
        { value: 'Funding Stage 01', selected: false, disabled: false },
        { value: 'Funding Stage 02', selected: false, disabled: false },
        { value: 'Funding Stage 03', selected: false, disabled: true },
      ],
      technology: [
        { value: 'Filecoin', selected: true, disabled: false },
        { value: 'IPFS', selected: false, disabled: true },
      ],
    });
  });
});