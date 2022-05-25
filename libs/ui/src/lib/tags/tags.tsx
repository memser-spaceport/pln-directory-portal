import { PlusIcon } from '@heroicons/react/solid';
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
          <span className="text-xs text-slate-400 h-[26px] w-[26px] border hover:border-sky-600 rounded-full flex items-center justify-center group">
            {items.length}
            <PlusIcon className="h-2 fill-slate-500 group-hover:fill-sky-600" />
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content
          side="top"
          align="center"
          sideOffset={5}
          className="flex-shrink-0 bg-sky-600 border border-sky-600 rounded-full text-white text-xs min-w-[50px] text-center font-light py-0.5 px-2"
        >
          <Tooltip.Arrow className="fill-sky-600" />
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
          className={`text-xs text-slate-400 font-medium px-3 py-1 mr-2 border rounded-full whitespace-nowrap ${
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
