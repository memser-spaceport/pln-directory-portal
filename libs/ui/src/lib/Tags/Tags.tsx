import { PlusIcon } from '@heroicons/react/solid';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useEffect, useRef, useState } from 'react';

export interface TagsProps {
  tagsList: string[];
}

const MARGIN_BETWEEN_TAGS = 8;
const TOOLTIP_SIZE = 26;

const renderTooltip = (hiddenTags: string[]) => {
  return (
    <Tooltip.Provider delayDuration={0}>
      <Tooltip.Root>
        <Tooltip.Trigger>
          <span
            className={`h-[${TOOLTIP_SIZE}px] w-[${TOOLTIP_SIZE}px] border hover:border-indigo-600 rounded-full flex items-center justify-center group`}
          >
            {hiddenTags.length}
            <PlusIcon className="h-2 fill-slate-500 group-hover:fill-indigo-600" />
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content
          side={'top'}
          align={'center'}
          sideOffset={5}
          className="bg-indigo-600 border border-indigo-600 rounded-full text-white text-xs min-w-[50px] text-center font-light py-0.5 px-2"
        >
          <Tooltip.Arrow className="fill-indigo-600" />
          {hiddenTags.toString()}
        </Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
};

export const renderTags = (arr: string[]) => {
  return arr.map((item: string, i: number) => (
    <span
      key={i}
      className={`text-xs px-3 py-1 mr-[${MARGIN_BETWEEN_TAGS}px] mb-2 border rounded-full`}
    >
      {item}
    </span>
  ));
};

export function Tags({ tagsList }: TagsProps) {
  const containerRef = useRef<HTMLHeadingElement>(null);
  let isOverflowing = false;
  const [hiddenTags, setHiddenTags] = useState<string[]>([]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const rightLimit =
      containerRef.current?.offsetLeft + containerRef.current?.offsetWidth;

    const childrenArr = Array.from(containerRef.current.children);

    childrenArr.forEach((el: Element) => {
      if (el instanceof HTMLElement) {
        isOverflowing = el.offsetLeft + el.offsetWidth >= rightLimit;

        if (isOverflowing && el.innerText) {
          setHiddenTags((tags) => [...tags, el.innerText]);
          el.style.display = 'none';
        }
      }
    });
  }, [isOverflowing]);

  return (
    <div className="flex items-start justify-start" ref={containerRef}>
      {renderTags(tagsList)}
      {hiddenTags.length ? renderTooltip(hiddenTags) : null}
    </div>
  );
}

export default Tags;
