import { PlusIcon } from '@heroicons/react/solid';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useRef } from 'react';

export interface TagsProps {
  items: string[];
}

function HiddenTagsTooltip(tags: string[]) {
  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <span className="h-[26px] w-[26px] border hover:border-indigo-600 rounded-full flex items-center justify-center group">
            {tags.length}
            <PlusIcon className="h-2 fill-slate-500 group-hover:fill-indigo-600" />
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content
          side="top"
          align="center"
          sideOffset={5}
          className="bg-indigo-600 border border-indigo-600 rounded-full text-white text-xs min-w-[50px] text-center font-light py-0.5 px-2"
        >
          <Tooltip.Arrow className="fill-indigo-600" />
          {tags.toString()}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

export const renderTags = (arr: string[]) => {
  return arr.map((item: string, i: number) => (
    <span
      key={i}
      className={`text-xs px-3 py-1 mr-[8px] mb-2 border rounded-full`}
    >
      {item}
    </span>
  ));
};

export function Tags({ items }: TagsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hiddenStartIndex = useRef(items.length);
  const showTags = items.slice(0, hiddenStartIndex.current);
  const hiddenTags = items.slice(hiddenStartIndex.current);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const { left, width } = containerRef.current.getBoundingClientRect();

    const rightLimit = left + width;

    const childrenArr = Array.from(
      containerRef.current.children
    ) as HTMLElement[];

    for (let i = 0; i < childrenArr.length; i++) {
      const el = childrenArr[i];

      const { left, width } = el.getBoundingClientRect();

      const isOverflowing = left + width >= rightLimit;

      if (isOverflowing) {
        hiddenStartIndex.current = i;
        break;
      }
    }
  }, []);

  return (
    <div className="flex items-start justify-start" ref={containerRef}>
      {renderTags(showTags)}
      {hiddenTags.length ? HiddenTagsTooltip(hiddenTags) : null}
    </div>
  );
}
