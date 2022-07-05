import Link from 'next/link';
import { HiddenTagsTooltip } from './hidden-tags-tooltip';

export interface ITagsGroupItem {
  disabled?: boolean;
  label: string;
  url?: string;
}

export interface TagsGroupProps {
  items: ITagsGroupItem[];
  isSingleLine?: boolean;
}

export function TagsGroup({ items, isSingleLine = false }: TagsGroupProps) {
  let visibleTags: ITagsGroupItem[];
  let hiddenTags: ITagsGroupItem[];

  if (isSingleLine && items.length > 1) {
    visibleTags = [items[0]];
    hiddenTags = items.slice(1);
  }

  return (
    <div
      className={`flex w-full items-start ${!isSingleLine ? 'flex-wrap' : ''}`}
    >
      {(visibleTags || items).map((item, i) => {
        if (item.url) {
          return (
            <Link key={i} href={item.url}>
              <a
                className={`tag ${!isSingleLine ? 'mb-2' : 'truncate'}
                ${
                  item.disabled
                    ? 'pointer-events-none'
                    : 'tag--clickable border border-slate-200 bg-white'
                } `}
              >
                {item.label}
              </a>
            </Link>
          );
        } else {
          return (
            <span
              key={i}
              className={`tag ${!isSingleLine ? 'mb-2' : 'truncate'}`}
            >
              {item.label}
            </span>
          );
        }
      })}

      {hiddenTags ? <HiddenTagsTooltip items={hiddenTags} /> : null}
    </div>
  );
}
