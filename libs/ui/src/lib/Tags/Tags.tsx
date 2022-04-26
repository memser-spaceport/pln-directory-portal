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
            <PlusIcon className="h-3 fill-slate-500 group-hover:fill-indigo-600" />
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
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [hiddenTags, setHiddenTags] = useState([]);

  useEffect(() => {
    const rightLimit =
      containerRef.current.offsetLeft + containerRef.current.offsetWidth;

    const childrenArr = containerRef.current
      ? [].slice.call(containerRef.current.children)
      : [];

    childrenArr.forEach((el: HTMLElement) => {
      const TOOLTIP_SPACE = MARGIN_BETWEEN_TAGS + TOOLTIP_SIZE;
      const elOverflows =
        el.offsetLeft + el.offsetWidth + TOOLTIP_SPACE >= rightLimit;
      setIsOverflowing(elOverflows);
      if (elOverflows) {
        setHiddenTags((tags) => [...tags, el.innerText]);
        el.style.display = 'none';
      }
    });
  }, []);

  return (
    <div className="flex items-start justify-start" ref={containerRef}>
      {renderTags(tagsList)}
      {isOverflowing && renderTooltip(hiddenTags)}
    </div>
  );
}

export default Tags;
