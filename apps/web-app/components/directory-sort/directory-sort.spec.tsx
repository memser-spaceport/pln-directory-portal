import { fireEvent, render, screen } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { createMockRouter } from '../../utils/test/createMockRouter';
import { DirectorySort } from './directory-sort';

describe('DirectorySort', () => {
  it('should have the option to sort ascending by name selected by default', () => {
    render(
      <RouterContext.Provider value={createMockRouter()}>
        <DirectorySort />
      </RouterContext.Provider>
    );

    const sortBtn = screen.getByText(/sorted:/i);

    expect(sortBtn).toHaveTextContent('A-Z');
  });

  describe('when the sort option changes', () => {
    it('should call the router push method with the selected sort option', () => {
      const push = jest.fn();

      render(
        <RouterContext.Provider value={createMockRouter({ push })}>
          <DirectorySort />
        </RouterContext.Provider>
      );

      const sortBtn = screen.getByText(/sorted:/i);
      fireEvent.click(sortBtn);

      const descendingOption = screen.getByText(/z-a/i);
      fireEvent.click(descendingOption);

      expect(push).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith(
        { pathname: '/', query: { sort: 'Name,desc' } },
        undefined,
        { shallow: true }
      );
    });
  });

  describe('when a sort query parameter is defined', () => {
    describe('and it has a valid value', () => {
      it('should select the defined option by default', () => {
        render(
          <RouterContext.Provider
            value={createMockRouter({ query: { sort: 'Name,desc' } })}
          >
            <DirectorySort />
          </RouterContext.Provider>
        );

        const sortBtn = screen.getByText(/sorted:/i);

        expect(sortBtn).toHaveTextContent('Z-A');
      });
    });

    describe('and it has an invalid value', () => {
      it('should keep the default option', () => {
        render(
          <RouterContext.Provider
            value={createMockRouter({ query: { sort: 'invalid' } })}
          >
            <DirectorySort />
          </RouterContext.Provider>
        );

        const sortBtn = screen.getByText(/sorted:/i);

        expect(sortBtn).toHaveTextContent('A-Z');
      });
    });
  });
});
