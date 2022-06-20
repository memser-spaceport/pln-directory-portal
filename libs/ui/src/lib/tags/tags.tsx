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
          <span className="group flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
            +{items.length}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content
          side="top"
          align="center"
          sideOffset={8}
          className="min-w-[50px] flex-shrink-0 rounded bg-slate-900 py-1 px-2 text-xs font-medium text-white"
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
      className={`flex w-full items-start ${
        isInline ? 'overflow-hidden' : 'flex-wrap'
      }`}
      ref={containerRef}
    >
      {items.map((item, i) => (
        <span
          key={i}
          className={`mr-2 h-[26px] whitespace-nowrap rounded-3xl bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 ${
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
