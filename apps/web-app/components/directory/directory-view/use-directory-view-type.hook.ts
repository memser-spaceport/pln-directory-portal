import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { DEFAULT_VIEW_TYPE } from './directory-view.constants';
import { TViewType, viewTypes } from './directory-view.types';

export function useViewType() {
  const { query, push, pathname } = useRouter();
  const queryViewType = query.viewType as TViewType;
  const selectedViewType: TViewType =
    queryViewType && viewTypes.includes(queryViewType)
      ? queryViewType
      : DEFAULT_VIEW_TYPE;

  const changeView = useCallback(
    (newViewType: TViewType) => {
      const { viewType, ...restQuery } = query;

      push(
        {
          pathname,
          query: {
            ...restQuery,
            ...(newViewType !== DEFAULT_VIEW_TYPE && { viewType: newViewType }),
          },
        },
        undefined,
        {
          shallow: true,
        }
      );
    },
    [query, push, pathname]
  );

  return { selectedViewType, changeView };
}
