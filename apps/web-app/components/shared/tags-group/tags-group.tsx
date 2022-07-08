import { HiddenTagsTooltip } from './hidden-tags-tooltip';

export interface TagsGroupProps {
  items: string[];
  isSingleLine?: boolean;
}

export function TagsGroup({ items, isSingleLine = false }: TagsGroupProps) {
  let visibleTags: string[];
  let hiddenTags: string[];

  if (isSingleLine && items.length > 1) {
    visibleTags = [items[0]];
    hiddenTags = items.slice(1);
  }

  return (
    <div
      className={`flex w-full items-start ${!isSingleLine ? 'flex-wrap' : ''}`}
    >
      {(visibleTags || items).map((item, i) => {
        return (
          <span
            key={i}
            className={`tag ${!isSingleLine ? 'mb-2' : 'truncate'}`}
          >
            {item}
          </span>
        );
      })}

      {hiddenTags ? <HiddenTagsTooltip items={hiddenTags} /> : null}
    </div>
  );
}
