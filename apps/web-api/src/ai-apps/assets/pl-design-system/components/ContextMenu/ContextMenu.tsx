'use client';

import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import clsx from 'clsx';
import type { ContextMenuItemProps, ContextMenuSubTriggerProps } from './ContextMenu.types';
import styles from './ContextMenu.module.scss';

function ChevronRightIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <polyline
        points="4,2 8,6 4,10"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const ContextMenu = ContextMenuPrimitive.Root;
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export function ContextMenuContent({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        className={clsx(styles.content, className)}
        {...props}
      >
        {children}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

export function ContextMenuItem({
  icon,
  shortcut,
  children,
  className,
  ...props
}: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item
      className={clsx(styles.item, className)}
      {...props}
    >
      {icon && <span className={styles.itemIcon}>{icon}</span>}
      {children}
      {shortcut && <span className={styles.shortcut}>{shortcut}</span>}
    </ContextMenuPrimitive.Item>
  );
}

export function ContextMenuLabel({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label>) {
  return (
    <ContextMenuPrimitive.Label className={clsx(styles.label, className)} {...props}>
      {children}
    </ContextMenuPrimitive.Label>
  );
}

export function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      className={clsx(styles.separator, className)}
      {...props}
    />
  );
}

export const ContextMenuSub = ContextMenuPrimitive.Sub;

export function ContextMenuSubTrigger({
  icon,
  children,
  className,
  ...props
}: ContextMenuSubTriggerProps) {
  return (
    <ContextMenuPrimitive.SubTrigger
      className={clsx(styles.subTrigger, className)}
      {...props}
    >
      {icon && <span className={styles.itemIcon}>{icon}</span>}
      {children}
      <span className={styles.chevron}>
        <ChevronRightIcon />
      </span>
    </ContextMenuPrimitive.SubTrigger>
  );
}

export function ContextMenuSubContent({
  children,
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        className={clsx(styles.subContent, className)}
        {...props}
      >
        {children}
      </ContextMenuPrimitive.SubContent>
    </ContextMenuPrimitive.Portal>
  );
}
