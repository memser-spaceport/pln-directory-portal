import { trackGoal } from 'fathom-client';
import { useRouter } from 'next/router';
import { useCallback, useEffect } from 'react';
import { FATHOM_EVENTS } from '../../constants';

type TDirectoryFiltersFathomLoggerDirectoryType = 'members' | 'teams';

export function useDirectoryFiltersFathomLogger(
  directoryType: TDirectoryFiltersFathomLoggerDirectoryType,
  filters: string[]
) {
  const { query } = useRouter();

  const trackGoals = useCallback(
    (items: string[], eventType: string) => {
      items
        .filter((item) => Object.keys(query).includes(item))
        .forEach((item) => {
          const eventCode =
            FATHOM_EVENTS[directoryType].directory[eventType][item];

          eventCode && trackGoal(eventCode, 0);
        });
    },
    [directoryType, query]
  );

  useEffect(() => {
    const controls = ['searchBy', 'sort', 'viewType'];

    trackGoals(filters, 'filters');
    trackGoals(controls, 'controls');
  }, [filters, trackGoals]);
}
