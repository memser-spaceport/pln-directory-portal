import { parseMembersFilters } from './members-directory-filters.utils';

describe('#parseMembersFilters', () => {
  it('should parse members filter values into each filter component`s consumable format', () => {
    expect(
      parseMembersFilters(
        {
          valuesByFilter: {
            skills: ['Skill 01', 'Skill 02', 'Skill 03'],
            region: ['Region 01', 'Region 02', 'Region 03'],
            country: ['Country 01', 'Country 02', 'Country 03'],
            metroArea: ['Metro Area 01', 'Metro Area 02', 'Metro Area 03'],
          },
          availableValuesByFilter: {
            skills: ['Skill 01', 'Skill 03'],
            region: ['Region 01', 'Region 03'],
            country: ['Country 01', 'Country 03'],
            metroArea: ['Metro Area 01', 'Metro Area 02'],
          },
        },
        {
          skills: 'Skill 01',
          technology: 'Filecoin',
        }
      )
    ).toEqual({
      skills: [
        { value: 'Skill 01', selected: true, disabled: false },
        { value: 'Skill 02', selected: false, disabled: true },
        { value: 'Skill 03', selected: false, disabled: false },
      ],
      region: [
        { value: 'Region 01', selected: false, disabled: false },
        { value: 'Region 02', selected: false, disabled: true },
        { value: 'Region 03', selected: false, disabled: false },
      ],
      country: [
        { value: 'Country 01', selected: false, disabled: false },
        { value: 'Country 02', selected: false, disabled: true },
        { value: 'Country 03', selected: false, disabled: false },
      ],
      metroArea: [
        { value: 'Metro Area 01', selected: false, disabled: false },
        { value: 'Metro Area 02', selected: false, disabled: false },
        { value: 'Metro Area 03', selected: false, disabled: true },
      ],
    });
  });
});
