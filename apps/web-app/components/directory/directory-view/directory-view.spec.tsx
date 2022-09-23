import { fireEvent, render, screen } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { createMockRouter } from '../../../utils/test/createMockRouter';
import { DirectoryView } from './directory-view';

describe('DirectoryView', () => {
  it('should show grid button as active and disable at first render', () => {
    render(
      <RouterContext.Provider value={createMockRouter()}>
        <DirectoryView directoryType="teams" />
      </RouterContext.Provider>
    );

    const gridBtn = screen.getByRole('button', {
      name: /change to grid view/i,
    });

    expect(gridBtn.parentElement.classList.contains('border-blue-100')).toBe(
      true
    );
    expect(gridBtn.parentElement.classList.contains('bg-blue-100')).toBe(true);
    expect(gridBtn).toHaveAttribute('disabled');
  });

  it('should call push method, including as arg the list viewType, after clicking on list button', () => {
    const push = jest.fn();

    render(
      <RouterContext.Provider value={createMockRouter({ push })}>
        <DirectoryView directoryType="teams" />
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
        <DirectoryView directoryType="teams" />
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

  it('should remove view type query parameter when default view type gets clicked', () => {
    const push = jest.fn();

    render(
      <RouterContext.Provider
        value={createMockRouter({ query: { viewType: 'list' }, push })}
      >
        <DirectoryView directoryType="teams" />
      </RouterContext.Provider>
    );

    const gridBtn = screen.getByRole('button', {
      name: /change to grid view/i,
    });

    fireEvent.click(gridBtn);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({ pathname: '/', query: {} }, undefined, {
      shallow: true,
    });
  });
});
