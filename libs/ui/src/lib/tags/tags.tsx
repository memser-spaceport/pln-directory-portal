import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useRef, useState } from 'react';

export interface TagsProps {
  items: string[];
  isInline?: boolean;
}

function HiddenTagsTooltip({ items }: TagsProps) {
  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <span className="flex items-center justify-center w-[26px] h-[26px] text-xs font-medium text-slate-600 rounded-full bg-slate-100 group">
            +{items.length}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content
          side="top"
          align="center"
          sideOffset={8}
          className="flex-shrink-0 bg-slate-900 rounded py-1 px-2 text-white text-xs font-medium min-w-[50px]"
        >
          {items.toString()}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function Tags({ items, isInline = true }: TagsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hiddenStartIndex, setHiddenStartIndex] = useState(() => items.length);
  const hiddenTags = items.slice(hiddenStartIndex);

  useEffect(() => {
    if (!containerRef.current || !isInline) {
      return;
    }

    const { left, width } = containerRef.current.getBoundingClientRect();
    const rightLimit = left + width;

    const childrenArr = Array.from(containerRef.current.children).filter(
      (e) => e.tagName === 'SPAN'
    ) as HTMLElement[];

    for (let i = 0; i < childrenArr.length; i++) {
      const el = childrenArr[i];

      const { left, width } = el.getBoundingClientRect();
      const isOverflowing = left + width >= rightLimit;

      if (isOverflowing) {
        setHiddenStartIndex(i);
        break;
      }
    }
  }, [isInline]);

  return (
    <div
      className={`flex items-start w-full ${
        isInline ? 'overflow-hidden' : 'flex-wrap'
      }`}
      ref={containerRef}
    >
      {items.map((item, i) => (
        <span
          key={i}
          className={`h-[26px] px-3 py-1.5 mr-2 text-xs font-medium text-slate-600 rounded-3xl bg-slate-100 whitespace-nowrap ${
            isInline && i >= hiddenStartIndex ? 'invisible' : 'visible mb-2'
          }`}
          style={{ order: i >= hiddenStartIndex ? i + 1 : i }}
        >
          {item}
        </span>
      ))}
      <div style={{ order: hiddenStartIndex }}>
        {hiddenTags.length ? <HiddenTagsTooltip items={hiddenTags} /> : null}
      </div>
    </div>
  );
}
