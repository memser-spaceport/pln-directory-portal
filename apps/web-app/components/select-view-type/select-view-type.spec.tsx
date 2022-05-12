import { fireEvent, render, screen } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { createMockRouter } from '../../utils/test/createMockRouter';
import { SelectViewType } from './select-view-type';

describe('SelectViewType', () => {
  it('should show grid button as active and disable at first render', () => {
    render(
      <RouterContext.Provider value={createMockRouter()}>
        <SelectViewType />
      </RouterContext.Provider>
    );

    const gridBtn = screen.getByRole('button', {
      name: /change to grid view/i,
    });

    expect(gridBtn.classList.contains('border-sky-600')).toBe(true);
    expect(gridBtn).toHaveAttribute('disabled');
  });

  it('should call push method, including as arg the list viewType, after clicking on list button', () => {
    const push = jest.fn();

    render(
      <RouterContext.Provider value={createMockRouter({ push })}>
        <SelectViewType />
      </RouterContext.Provider>
    );

    const listBtn = screen.getByRole('button', {
      name: /change to list view/i,
    });

    fireEvent.click(listBtn);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(
      { pathname: '/', query: { viewType: 'list' } },
      undefined,
      { shallow: true }
    );
  });

  it('should add disabled property to list button and remove it from grid button', () => {
    render(
      <RouterContext.Provider
        value={createMockRouter({ query: { viewType: 'list' } })}
      >
        <SelectViewType />
      </RouterContext.Provider>
    );

    const gridBtn = screen.getByRole('button', {
      name: /change to grid view/i,
    });
    const listBtn = screen.getByRole('button', {
      name: /change to list view/i,
    });

    expect(listBtn).toHaveAttribute('disabled');
    expect(gridBtn).not.toHaveAttribute('disabled');
  });
});
