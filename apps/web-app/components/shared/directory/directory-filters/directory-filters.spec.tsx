import { fireEvent, render, screen } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { createMockRouter } from '../../../../utils/test/createMockRouter';
import { DirectoryFilters } from './directory-filters';

describe('DirectoryFilters', () => {
  it('should clear the filter related query parameters when user clicks to clear filters', () => {
    const push = jest.fn();

    render(
      <RouterContext.Provider
        value={createMockRouter({
          query: {
            tags: 'tag_01',
            membershipSources: 'membership_source_01',
            sort: 'Name,desc',
          },
          push,
        })}
      >
        <DirectoryFilters filterProperties={['tags', 'membershipSources']}>
          <div></div>
        </DirectoryFilters>
      </RouterContext.Provider>
    );

    const clearFiltersBtn = screen.getByRole('button', {
      name: /clear filters/i,
    });
    fireEvent.click(clearFiltersBtn);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      pathname: '/',
      query: { sort: 'Name,desc' },
    });
  });
});