import { useRouter } from 'next/router';
import { MutableRefObject, useCallback, useEffect, useState } from 'react';

export function useHideOverflowingTags(
  containerRef: MutableRefObject<HTMLDivElement>,
  tags: string[]
) {
  const sortedTags = [...tags].sort((a, b) => a.length - b.length);
  const [visibleTags, setVisibleTags] = useState(sortedTags);
  const [hiddenTags, setHiddenTags] = useState<string[]>([]);
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
        setVisibleTags(sortedTags);
        setHiddenTags([]);
      }
    },
    [sortedTags, setVisibleTags, setHiddenTags]
  );

  useEffect(() => {
    if (
      !containerRef.current ||
      tags.length === 1 ||
      visibleTags.length === 1
    ) {
      return;
    }

    const { right: containerLimit } =
      containerRef.current.getBoundingClientRect();
    const containerLimitWithSafetyMargin = containerLimit - 36; // Add 36px safety margin (based on "+X" button size)
    const tagElements = Array.from(containerRef.current.children).filter(
      (el: HTMLElement) => el.classList.contains('tag')
    ) as HTMLElement[];
    const lastTagEl = tagElements[tagElements.length - 1];
    const { right: lastTagLimit } = lastTagEl.getBoundingClientRect();

    if (lastTagLimit > containerLimitWithSafetyMargin) {
      setHiddenTags([...visibleTags.slice(-1), ...hiddenTags]);
      setVisibleTags(visibleTags.slice(0, -1));
    }
  }, [containerRef, tags, hiddenTags, visibleTags]);

  return { visibleTags, hiddenTags };
}
