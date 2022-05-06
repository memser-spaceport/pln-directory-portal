import { useRouter } from 'next/router';
import { TViewType, viewTypes } from './view-types.types';

export function useViewType(initialViewType: TViewType = 'grid') {
  const { query, push, pathname } = useRouter();
  const queryViewType = query.viewType as TViewType;
  const selectedViewType: TViewType =
    queryViewType && viewTypes.includes(queryViewType)
      ? queryViewType
      : initialViewType;

  function changeView(viewType: TViewType) {
    push({ pathname, query: { ...query, viewType } }, undefined, {
      shallow: true,
    });
  }

  return { selectedViewType, changeView };
}
