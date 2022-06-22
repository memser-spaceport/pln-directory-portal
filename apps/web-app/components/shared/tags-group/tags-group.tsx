import Link from 'next/link';
import { useRef } from 'react';
import { HiddenTagsTooltip } from './hidden-tags-tooltip';
import { useHideOverflowingTags } from './use-hide-overflowing-tags.hook';

export interface ITagsGroupItem {
  disabled?: boolean;
  label: string;
  url?: string;
}

export interface TagsGroupProps {
  items: ITagsGroupItem[];
  isInline?: boolean;
}

export function TagsGroup({ items, isInline = true }: TagsGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { hiddenStartIndex, hiddenTags } = useHideOverflowingTags(
    containerRef,
    items
  );

  return (
    <div
      className={`flex w-full items-start ${
        isInline ? 'overflow-hidden' : 'flex-wrap'
      }`}
      ref={containerRef}
    >
      {items.map((item, i) => {
        if (item?.url) {
          return (
            <Link key={i} href={item.url}>
              <a
                className={`tag ${!isInline ? 'mb-2' : ''}
                ${
                  item.disabled
                    ? 'pointer-events-none'
                    : 'tag--clickable border border-slate-200 bg-white'
                } ${
                  isInline && i >= hiddenStartIndex ? 'invisible' : 'visible'
                }`}
                style={{ order: i >= hiddenStartIndex ? i + 1 : i }}
              >
                {item.label}
              </a>
            </Link>
          );
        } else {
          return (
            <span
              key={i}
              className={`tag ${
                isInline && i >= hiddenStartIndex ? 'invisible' : 'visible mb-2'
              }`}
              style={{ order: i >= hiddenStartIndex ? i + 1 : i }}
            >
              {item.label}
            </span>
          );
        }
      })}

      {isInline ? (
        <div style={{ order: hiddenStartIndex }}>
          {hiddenTags.length ? <HiddenTagsTooltip items={hiddenTags} /> : null}
        </div>
      ) : null}
    </div>
  );
}
