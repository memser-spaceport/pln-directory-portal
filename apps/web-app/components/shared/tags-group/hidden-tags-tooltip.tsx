import * as HoverCard from '@radix-ui/react-hover-card';
import Link from 'next/link';
import { ITagsGroupItem } from './tags-group';

export interface HiddenTagsTooltipProps {
  items: ITagsGroupItem[];
}

export function HiddenTagsTooltip({ items }: HiddenTagsTooltipProps) {
  return (
    <HoverCard.Root openDelay={0}>
      <HoverCard.Trigger>
        <span className="tag tag--clickable group flex h-7 w-7 cursor-pointer items-center justify-center rounded-full">
          +{items.length}
        </span>
      </HoverCard.Trigger>
      <HoverCard.Content
        side="top"
        align="center"
        sideOffset={8}
        className="min-w-[50px] flex-shrink-0 rounded bg-slate-900 p-2 text-xs font-medium text-slate-200"
      >
        {items.map((item, i) =>
          item?.url ? (
            <Link key={i} href={item.url}>
              <a
                className={`${
                  item.disabled
                    ? 'pointer-events-none'
                    : 'hover:text-sky-700 focus:text-sky-700'
                } block whitespace-nowrap
                border-b border-slate-200 p-1 last:border-b-0`}
              >
                {item.label}
              </a>
            </Link>
          ) : (
            <span
              key={i}
              className="after:mr-1 after:content-[',']  last:after:content-['']"
            >
              {item.label}
            </span>
          )
        )}
      </HoverCard.Content>
    </HoverCard.Root>
  );
}
