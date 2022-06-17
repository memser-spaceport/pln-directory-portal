import { parseTeamsFilters } from './teams-directory-filters.utils';

describe('#parseTeamsFilters', () => {
  it('should parse teams filter values into each filter component`s consumable format', () => {
    expect(
      parseTeamsFilters(
        {
          valuesByFilter: {
            industry: ['Industry 01', 'Industry 02', 'Industry 03'],
            fundingVehicle: [
              'Funding Vehicle 01',
              'Funding Vehicle 02',
              'Funding Vehicle 03',
            ],
            fundingStage: [
              'Funding Stage 01',
              'Funding Stage 02',
              'Funding Stage 03',
            ],
            technology: ['Filecoin', 'IPFS'],
          },
          availableValuesByFilter: {
            industry: ['Industry 01', 'Industry 03'],
            fundingVehicle: ['Funding Vehicle 01', 'Funding Vehicle 03'],
            fundingStage: ['Funding Stage 01', 'Funding Stage 02'],
            technology: ['Filecoin'],
          },
        },
        {
          industry: 'Industry 01',
          technology: 'Filecoin',
        }
      )
    ).toEqual({
      industry: [
        { value: 'Industry 01', selected: true, disabled: false },
        { value: 'Industry 02', selected: false, disabled: true },
        { value: 'Industry 03', selected: false, disabled: false },
      ],
      fundingVehicle: [
        { value: 'Funding Vehicle 01', selected: false, disabled: false },
        { value: 'Funding Vehicle 02', selected: false, disabled: true },
        { value: 'Funding Vehicle 03', selected: false, disabled: false },
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
