import { useRef } from 'react';
import { HiddenTagsTooltip } from './hidden-tags-tooltip';
import { useHideOverflowingTags } from './use-hide-overflowing-tags.hook';

export interface TagsGroupProps {
  items: string[];
  isSingleLine?: boolean;
}
export function TagsGroup({ items, isSingleLine = false }: TagsGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { visibleTags, hiddenTags } = useHideOverflowingTags(
    containerRef,
    items
  );

  return (
    <div
      className={`flex w-full items-start ${isSingleLine ? '' : 'flex-wrap'}`}
      ref={containerRef}
    >
      {visibleTags.map((tag, i) => {
        return (
          <span
            key={i}
            className={`tag mr-2 last:mr-0 ${
              isSingleLine && visibleTags.length === 1
                ? 'overflow-hidden text-ellipsis whitespace-nowrap'
                : 'mb-2'
            }`}
          >
            {tag}
          </span>
        );
      })}

      {isSingleLine && hiddenTags.length ? (
        <div>
          <HiddenTagsTooltip items={hiddenTags} />
        </div>
      ) : null}
    </div>
  );
}
