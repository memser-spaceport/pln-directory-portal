import { useMemo } from 'react';

export function useIsEmail(value: string | null): boolean {
  return useMemo(() => {
    if (value == null) {
      return false;
    }

    const emailRegex = /^(\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b)$/gi;

    return value.match(emailRegex) != null;
  }, [value]);
}
