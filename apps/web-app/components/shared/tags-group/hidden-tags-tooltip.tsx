import { Tooltip } from '@protocol-labs-network/ui';

export interface HiddenTagsTooltipProps {
  items: string[];
}

export function HiddenTagsTooltip({ items }: HiddenTagsTooltipProps) {
  const hiddenTagsTrigger = () => (
    <span className="tag group flex h-7 w-7 cursor-pointer items-center justify-center rounded-full hover:bg-slate-200 hover:text-slate-900">
      +{items.length}
    </span>
  );

  return <Tooltip Trigger={hiddenTagsTrigger}>{items.join(', ')}</Tooltip>;
}
