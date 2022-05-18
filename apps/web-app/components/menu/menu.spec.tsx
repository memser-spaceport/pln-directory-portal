import { render } from '@testing-library/react';
import { RouterContext } from 'next/dist/shared/lib/router-context';
import { createMockRouter } from '../../utils/test/createMockRouter';
import Menu from './menu';

describe('Menu', () => {
  it('should render teams link', () => {
    const { getByTestId, getByText } = render(
      <RouterContext.Provider value={createMockRouter()}>
        <Menu />
      </RouterContext.Provider>
    );
    expect(getByTestId('Teams-icon')).toBeTruthy();
    expect(getByText('Teams')).toBeInTheDocument();
  });

  it('should render labbers link', () => {
    const { getByTestId, getByText } = render(
      <RouterContext.Provider value={createMockRouter()}>
        <Menu />
      </RouterContext.Provider>
    );
    expect(getByTestId('Labbers-icon')).toBeInTheDocument();
    expect(getByText('Labbers')).toBeInTheDocument();
  });
});
