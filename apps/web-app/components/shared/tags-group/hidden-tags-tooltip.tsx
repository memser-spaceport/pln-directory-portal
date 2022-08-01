import { Tooltip } from '@protocol-labs-network/ui';

export interface HiddenTagsTooltipProps {
  items: string[];
}

export function HiddenTagsTooltip({ items }: HiddenTagsTooltipProps) {
  const hiddenTagsTrigger = () => (
    <span className="tag group flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full p-0 hover:bg-slate-200 hover:text-slate-900">
      +{items.length}
    </span>
  );

  return <Tooltip Trigger={hiddenTagsTrigger}>{items.join(', ')}</Tooltip>;
}
