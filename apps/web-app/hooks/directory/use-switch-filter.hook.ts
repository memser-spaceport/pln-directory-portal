import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

export function useSwitchFilter(filterName: string) {
  const { query, push, pathname } = useRouter();
  const [enabled, setEnabled] = useState(!!query[filterName]);

  useEffect(() => {
    setEnabled(!!query[filterName]);
  }, [setEnabled, query, filterName]);

  const onSetEnabled = useCallback(
    (value: boolean) => {
      const { [filterName]: queryFilterValue, ...restQuery } = query;
      setEnabled(value);
      push({
        pathname,
        query: {
          ...restQuery,
          ...(value && {
            [filterName]: true,
          }),
        },
      });
    },
    [query, push, pathname, setEnabled, filterName]
  );

  return { enabled, onSetEnabled };
}
