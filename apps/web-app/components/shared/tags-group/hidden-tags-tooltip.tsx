import { Tooltip } from '@protocol-labs-network/ui';
import Link from 'next/link';
import { ITagsGroupItem } from './tags-group';

export interface HiddenTagsTooltipProps {
  items: ITagsGroupItem[];
}

export function HiddenTagsTooltip({ items }: HiddenTagsTooltipProps) {
  const hiddenTagsTrigger = () => (
    <span className="tag tag--clickable group flex h-7 w-7 cursor-pointer items-center justify-center rounded-full">
      +{items.length}
    </span>
  );

  return (
    <Tooltip Trigger={hiddenTagsTrigger}>
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
    </Tooltip>
  );
}
