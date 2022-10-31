import { fireEvent, render, screen } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { createMockRouter } from '../../../utils/test/createMockRouter';
import { DirectoryEmpty } from './directory-empty';

describe('DirectoryEmpty', () => {
  it('should clear the filter related query parameters when user clicks to clear filters', () => {
    const push = jest.fn();

    render(
      <RouterContext.Provider
        value={createMockRouter({
          query: {
            tags: 'tag_01',
            acceleratorPrograms: 'accelerator_program_01',
            sort: 'Name,desc',
          },
          push,
        })}
      >
        <DirectoryEmpty filterProperties={['tags', 'acceleratorPrograms']} />
      </RouterContext.Provider>
    );

    const clearFiltersBtn = screen.getByRole('button', {
      name: /clear all the criteria/i,
    });
    fireEvent.click(clearFiltersBtn);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      pathname: '/',
      query: { sort: 'Name,desc' },
    });
  });
});
