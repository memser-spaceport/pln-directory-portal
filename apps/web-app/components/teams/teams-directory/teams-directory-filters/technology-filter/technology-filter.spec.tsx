import { fireEvent, render, screen } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { createMockRouter } from '../../../../../utils/test/createMockRouter';
import { IFilterTag } from '../../../../shared/directory/directory-filters/directory-tags-filter/directory-tags-filter.types';
import { TechnologyFilter } from './technology-filter';

const tags: IFilterTag[] = [
  {
    value: 'Filecoin',
    selected: false,
    disabled: false,
  },
  {
    value: 'IPFS',
    selected: false,
    disabled: false,
  },
];

describe('TechnologyFilter', () => {
  it('should call the router push method with the selected options when a tag gets clicked', () => {
    const push = jest.fn();

    render(
      <RouterContext.Provider value={createMockRouter({ push, query: {} })}>
        <TechnologyFilter technologyTags={tags} />
      </RouterContext.Provider>
    );

    const tag = screen.getByText('Filecoin');
    fireEvent.click(tag);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      pathname: '/',
      query: { technology: 'Filecoin' },
    });
  });
});
