import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export interface TooltipProps {
  trigger: React.ReactElement;
  triggerClassName?: string;
  content: string | React.ReactElement;
  asChild?: boolean;
}

export function Tooltip({
  trigger,
  triggerClassName = '',
  content,
  asChild = false,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger
          className={triggerClassName}
          asChild={asChild}
        >
          {trigger}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Content
          side="top"
          align="center"
          sideOffset={8}
          className="z-40 max-w-[260px] flex-shrink-0 break-words rounded bg-slate-900 py-1 px-2 text-xs font-medium text-white"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
