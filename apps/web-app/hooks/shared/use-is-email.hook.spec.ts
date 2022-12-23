import { renderHook } from '@testing-library/react-hooks';
import { useIsEmail } from './use-is-email.hook';

describe('useIsEmail', () => {
  it('should return true for a valid email address', () => {
    const { result } = renderHook(() => useIsEmail('test@example.com'));
    expect(result.current).toBe(true);
  });

  it('should return false for an invalid email address', () => {
    const { result } = renderHook(() => useIsEmail('invalid'));
    expect(result.current).toBe(false);
  });

  it('should return false for a webpage URL', () => {
    const { result } = renderHook(() => useIsEmail('https://www.example.com'));
    expect(result.current).toBe(false);
  });

  it('should return false for a webpage URL that contains an email address', () => {
    const { result } = renderHook(() =>
      useIsEmail('https://www.example.com?email=test@example.com')
    );
    expect(result.current).toBe(false);
  });

  it('should return false for an empty string', () => {
    const { result } = renderHook(() => useIsEmail(''));
    expect(result.current).toBe(false);
  });

  it('should return false for null', () => {
    const { result } = renderHook(() => useIsEmail(null));
    expect(result.current).toBe(false);
  });
});
