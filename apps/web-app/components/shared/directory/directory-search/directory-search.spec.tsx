import { render, screen } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { createMockRouter } from '../../../../utils/test/createMockRouter';
import { DirectorySearch } from './directory-search';

describe('DirectorySearch', () => {
  const searchTerm = 'test';

  it('should have an input with a value equal to the term in the searchBy query parameter', () => {
    render(
      <RouterContext.Provider
        value={createMockRouter({ query: { searchBy: searchTerm } })}
      >
        <DirectorySearch />
      </RouterContext.Provider>
    );

    const inputEl = screen.getByRole('textbox') as HTMLInputElement;
    expect(inputEl.value).toBe('test');
  });
});
