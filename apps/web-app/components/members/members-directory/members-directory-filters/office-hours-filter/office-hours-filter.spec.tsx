import { fireEvent, render, screen } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { createMockRouter } from '../../../../../utils/test/createMockRouter';
import { OfficeHoursFilter } from './office-hours-filter';

describe('OfficeHoursFilter', () => {
  it('should call the router push method with the appropriate value when the switch gets clicked', () => {
    const push = jest.fn();

    render(
      <RouterContext.Provider value={createMockRouter({ push, query: {} })}>
        <OfficeHoursFilter />
      </RouterContext.Provider>
    );

    const switchBtn = screen.getByTestId('switch__button');

    fireEvent.click(switchBtn);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith({
      pathname: '/',
      query: { officeHoursOnly: true },
    });

    fireEvent.click(switchBtn);
    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenCalledWith({
      pathname: '/',
      query: {},
    });
  });
});