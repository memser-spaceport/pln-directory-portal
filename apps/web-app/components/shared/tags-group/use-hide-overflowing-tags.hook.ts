import { MutableRefObject, useEffect, useState } from 'react';

export function useHideOverflowingTags(
  containerRef: MutableRefObject<HTMLDivElement>,
  tags: string[]
) {
  const [visibleTags, setVisibleTags] = useState(
    tags.sort((a, b) => a.length - b.length)
  );
  const [hiddenTags, setHiddenTags] = useState<string[]>([]);

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
