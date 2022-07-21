import * as TooltipPrimitive from '@radix-ui/react-tooltip';

export interface TooltipProps {
  Trigger: React.ElementType;
  children?: React.ReactNode;
}

export function Tooltip({ Trigger, children }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={0}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger className="cursor-pointer">
          <Trigger />
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Content
          side="top"
          align="center"
          sideOffset={8}
          className="flex-shrink-0 rounded bg-slate-900 py-1 px-2 text-xs font-medium text-white"
        >
          {children}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
