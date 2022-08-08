import { getTagsFromValues } from './directory-filters.utils';

describe('#getTagsFromValues', () => {
  it('should get tags based on provided values when query parameters value is a string', () => {
    expect(
      getTagsFromValues(
        ['Value 01', 'Value 02', 'Value 03', 'Value 04', 'Value 05'],
        ['Value 01', 'Value 02', 'Value 03'],
        'Value 01|Value 02|Value 05'
      )
    ).toEqual([
      { value: 'Value 01', selected: true, disabled: false },
      { value: 'Value 02', selected: true, disabled: false },
      { value: 'Value 03', selected: false, disabled: false },
      { value: 'Value 04', selected: false, disabled: true },
      { value: 'Value 05', selected: true, disabled: false },
    ]);
  });

  it('should get tags based on provided values when query parameters value is an array of strings', () => {
    expect(
      getTagsFromValues(
        ['Value 01', 'Value 02', 'Value 03', 'Value 04', 'Value 05'],
        ['Value 01', 'Value 02', 'Value 03'],
        ['Value 01', 'Value 02', 'Value 05']
      )
    ).toEqual([
      { value: 'Value 01', selected: true, disabled: false },
      { value: 'Value 02', selected: true, disabled: false },
      { value: 'Value 03', selected: false, disabled: false },
      { value: 'Value 04', selected: false, disabled: true },
      { value: 'Value 05', selected: true, disabled: false },
    ]);
  });

  it('should get tags based on provided values when query parameters value is not provided', () => {
    expect(
      getTagsFromValues(
        ['Value 01', 'Value 02', 'Value 03', 'Value 04', 'Value 05'],
        ['Value 01', 'Value 02', 'Value 03']
      )
    ).toEqual([
      { value: 'Value 01', selected: false, disabled: false },
      { value: 'Value 02', selected: false, disabled: false },
      { value: 'Value 03', selected: false, disabled: false },
      { value: 'Value 04', selected: false, disabled: true },
      { value: 'Value 05', selected: false, disabled: true },
    ]);
  });
});
