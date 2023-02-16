import { fireEvent, render, screen } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { createMockRouter } from '../../../../../utils/test/createMockRouter';
import { IFilterTag } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { RegionFilter } from './region-filter';

const tags: IFilterTag[] = [
  {
    value: 'Tag 01',
    selected: false,
    disabled: false,
  },
  {
    value: 'Tag 02',
    selected: false,
    disabled: false,
  },
];

describe('RegionFilter', () => {
  it('should call the router push method with the selected options when a tag gets clicked', () => {
    const push = jest.fn();

    render(
      <RouterContext.Provider value={createMockRouter({ push, query: {} })}>
        <RegionFilter regionTags={tags} />
      </RouterContext.Provider>
    );

    const tag = screen.getByText('Tag 01');
    fireEvent.click(tag);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      pathname: '/',
      query: { region: 'Tag 01' },
    });
  });
});
