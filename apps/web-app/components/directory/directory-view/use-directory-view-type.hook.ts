import { trackGoal } from 'fathom-client';
import { useRouter } from 'next/router';
import { useCallback } from 'react';
import { FATHOM_EVENTS } from '../../../constants';
import { TDirectoryType } from './../directory.types';
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
    (newViewType: TViewType, directoryType: TDirectoryType) => {
      const { viewType, ...restQuery } = query;

      const viewTypeChange =
        newViewType === 'grid' ? 'viewTypeListToGrid' : 'viewTypeGridToList';

      const generalEventCode = FATHOM_EVENTS.directory.controls[viewTypeChange];
      generalEventCode && trackGoal(generalEventCode, 0);

      const directoryTypeEventCode =
        FATHOM_EVENTS[directoryType].directory.controls[viewTypeChange];
      directoryTypeEventCode && trackGoal(directoryTypeEventCode, 0);

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
