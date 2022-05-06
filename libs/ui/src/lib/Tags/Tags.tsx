import { PlusIcon } from '@heroicons/react/solid';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useRef, useState } from 'react';

export interface TagsProps {
  items: string[];
}

function HiddenTagsTooltip({ items }: TagsProps) {
  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <span className="h-[26px] w-[26px] border hover:border-indigo-600 rounded-full flex items-center justify-center group">
            {items.length}
            <PlusIcon className="h-2 fill-slate-500 group-hover:fill-indigo-600" />
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content
          side="top"
          align="center"
          sideOffset={5}
          className="flex-shrink-0 bg-indigo-600 border border-indigo-600 rounded-full text-white text-xs min-w-[50px] text-center font-light py-0.5 px-2"
        >
          <Tooltip.Arrow className="fill-indigo-600" />
          {items.toString()}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export function Tags({ items }: TagsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hiddenStartIndex, setHiddenStartIndex] = useState(() => items.length);
  const hiddenTags = items.slice(hiddenStartIndex);

  useEffect(() => {
    if (!containerRef.current) {
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
  }, []);

  return (
    <div className="flex items-start w-full overflow-hidden">
      <div className="flex items-start w-full" ref={containerRef}>
        {items.map((item, i) => (
          <span
            key={i}
            className={`text-xs px-3 py-1 mr-2 border rounded-full ${
              i >= hiddenStartIndex ? 'invisible' : 'visible'
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
    </div>
  );
}
