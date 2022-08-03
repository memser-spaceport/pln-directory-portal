import { fireEvent, render, screen } from '@testing-library/react';
import { Switch } from './switch';

describe('Switch', () => {
  it('should be disabled by default', () => {
    render(<Switch />);
    const switchBtn = screen.getByTestId('switch__button');
    expect(switchBtn.classList).not.toContain('bg-blue-600');
  });

  it('should get enabled if the user clicks on it', () => {
    render(<Switch />);
    const switchBtn = screen.getByTestId('switch__button');
    fireEvent.click(switchBtn);
    expect(switchBtn.classList).toContain('bg-blue-600');
  });

  it('should be enabled if initial value is set to true', () => {
    render(<Switch initialValue />);
    const switchBtn = screen.getByTestId('switch__button');
    expect(switchBtn.classList).toContain('bg-blue-600');
  });
});
