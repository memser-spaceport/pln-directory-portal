'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import clsx from 'clsx';
import type { TooltipProps } from './Tooltip.types';
import styles from './Tooltip.module.scss';

export function Tooltip({
  children,
  content,
  title,
  theme = 'dark',
  size = 'md',
  side = 'top',
  align = 'center',
  delayDuration = 400,
  defaultOpen,
  open,
  onOpenChange,
}: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root
        defaultOpen={defaultOpen}
        open={open}
        onOpenChange={onOpenChange}
      >
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={6}
            className={clsx(
              styles.content,
              styles[`theme-${theme}`],
              styles[`size-${size}`],
            )}
          >
            {title && <span className={styles.title}>{title}</span>}
            {content}
            <TooltipPrimitive.Arrow className={styles.arrow} width={10} height={5} />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
