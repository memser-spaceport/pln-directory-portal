import { useEffect, useState } from 'react';

export function useHideOverflowingTags(containerRef, items) {
  const [hiddenStartIndex, setHiddenStartIndex] = useState(() => items.length);
  const hiddenTags = items.slice(hiddenStartIndex);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const { left, width } = containerRef.current.getBoundingClientRect();
    const containerRightLimit = left + width;

    const tagsElArr = Array.from(containerRef.current.children).filter(
      (el: HTMLElement) => el.tagName === 'SPAN' || el.tagName === 'A'
    ) as HTMLElement[];
    const tooltipTrigger = Array.from(containerRef.current.children).filter(
      (el: HTMLElement) => el.tagName === 'DIV'
    ) as HTMLElement[];

    for (let i = 0; i < tagsElArr.length; i++) {
      const el = tagsElArr[i];
      const { left: elLeft, width: elWidth } = el.getBoundingClientRect();
      const isOverflowing = elLeft + elWidth >= containerRightLimit;

      if (isOverflowing) {
        const { width: tooltipWidth } =
          tooltipTrigger[0].getBoundingClientRect();
        const tooltipLeftMargin = 8;
        const tooltipSpace = tooltipWidth + tooltipLeftMargin;
        const isLast = i === tagsElArr.length - 1;

        !isLast && left + width >= containerRightLimit - tooltipSpace
          ? setHiddenStartIndex(i - 1)
          : setHiddenStartIndex(i);

        break;
      }
    }
  }, [containerRef]);

  return { hiddenStartIndex, hiddenTags };
}
