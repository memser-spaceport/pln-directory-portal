import * as HoverCard from '@radix-ui/react-hover-card';

export interface TooltipProps {
  Trigger: React.ElementType;
  children?: React.ReactNode;
}

export function Tooltip({ Trigger, children }: TooltipProps) {
  return (
    <HoverCard.Root openDelay={0} closeDelay={0}>
      <HoverCard.Trigger className="cursor-pointer">
        <Trigger />
      </HoverCard.Trigger>
      <HoverCard.Content
        side="top"
        align="center"
        sideOffset={8}
        className="flex-shrink-0 rounded bg-slate-900 py-1 px-2 text-xs font-medium text-white"
      >
        {children}
      </HoverCard.Content>
    </HoverCard.Root>
  );
}
