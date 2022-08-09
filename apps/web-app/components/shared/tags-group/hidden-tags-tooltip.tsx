import { Tooltip } from '@protocol-labs-network/ui';

export interface HiddenTagsTooltipProps {
  items: string[];
}

export function HiddenTagsTooltip({ items }: HiddenTagsTooltipProps) {
  return (
    <Tooltip
      trigger={
        <span className="tag h-6.5 w-6.5 leading-3.5 group flex shrink-0 cursor-pointer items-center justify-center rounded-full p-0 hover:bg-slate-200 hover:text-slate-900">
          +{items.length}
        </span>
      }
      triggerClassName="on-focus focus-within:rounded-full focus:rounded-full focus-visible:rounded-full"
      content={items.join(', ')}
    />
  );
}
