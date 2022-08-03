import { Tooltip } from '@protocol-labs-network/ui';

export interface HiddenTagsTooltipProps {
  items: string[];
}

export function HiddenTagsTooltip({ items }: HiddenTagsTooltipProps) {
  return (
    <Tooltip
      trigger={
        <span className="tag group flex h-[26px] w-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full p-0 leading-[14px] hover:bg-slate-200 hover:text-slate-900">
          +{items.length}
        </span>
      }
      content={items.join(', ')}
    />
  );
}
