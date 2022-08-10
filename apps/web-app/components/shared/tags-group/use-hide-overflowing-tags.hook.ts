import { useRouter } from 'next/router';
import { MutableRefObject, useCallback, useEffect, useReducer } from 'react';

interface IReducerState {
  visibleTags: string[];
  hiddenTags: string[];
}

export function useHideOverflowingTags(
  containerRef: MutableRefObject<HTMLDivElement>,
  tags: string[]
) {
  const sortedTags = [...tags].sort((a, b) => a.length - b.length);
  const [state, setState] = useReducer(
    (state: IReducerState, newState: Partial<IReducerState>) => ({
      ...state,
      ...newState,
    }),
    {
      visibleTags: sortedTags,
      hiddenTags: [] as string[],
    }
  );
  const router = useRouter();

  useEffect(() => {
    // Listen to route changes to re-calculate visible tags
    router.events.on('routeChangeComplete', handleRouteChange);

    return () => {
      router.events.off('routeChangeComplete', handleRouteChange);
    };
  });

  // When navigation is shallow, reset the visible and hidden tags to force
  // a re-calculation.
  const handleRouteChange = useCallback(
    (_pathname: string, { shallow }: { shallow: boolean }) => {
      if (shallow) {
        setState({
          visibleTags: sortedTags,
          hiddenTags: [],
        });
      }
    },
    [sortedTags]
  );

  useEffect(() => {
    if (
      !containerRef.current ||
      tags.length === 1 ||
      state.visibleTags.length === 1
    ) {
      return;
    }

    const { right: containerLimit } =
      containerRef.current.getBoundingClientRect();
    const containerLimitWithSafetyMargin = containerLimit - 34; // Add 34px safety margin (based on "+X" button size)
    const tagElements = Array.from(containerRef.current.children).filter(
      (el: HTMLElement) => el.classList.contains('tag')
    ) as HTMLElement[];
    const lastTagEl = tagElements[tagElements.length - 1];
    const { right: lastTagLimit } = lastTagEl.getBoundingClientRect();

    if (lastTagLimit > containerLimitWithSafetyMargin) {
      setState({
        visibleTags: state.visibleTags.slice(0, -1),
        hiddenTags: [...state.visibleTags.slice(-1), ...state.hiddenTags],
      });
    }
  }, [containerRef, tags, state]);

  return { visibleTags: state.visibleTags, hiddenTags: state.hiddenTags };
}
