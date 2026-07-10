'use client';

import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import clsx from 'clsx';
import type {
  DropdownProps,
  DropdownItemProps,
  DropdownLabelProps,
  DropdownSeparatorProps,
} from './Dropdown.types';
import styles from './Dropdown.module.scss';

export function Dropdown({
  children,
  trigger,
  align = 'start',
  side = 'bottom',
}: DropdownProps) {
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content
          align={align}
          side={side}
          sideOffset={4}
          className={styles.content}
        >
          {children}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export function DropdownItem({
  icon,
  rightContent,
  className,
  children,
  ...props
}: DropdownItemProps) {
  return (
    <DropdownPrimitive.Item
      className={clsx(styles.item, className)}
      {...props}
    >
      {icon && <span className={styles.itemIcon}>{icon}</span>}
      {children}
      {rightContent && <span className={styles.itemRight}>{rightContent}</span>}
    </DropdownPrimitive.Item>
  );
}

export function DropdownLabel({ children, className }: DropdownLabelProps) {
  return (
    <DropdownPrimitive.Label className={clsx(styles.label, className)}>
      {children}
    </DropdownPrimitive.Label>
  );
}

export function DropdownSeparator({ className }: DropdownSeparatorProps) {
  return (
    <DropdownPrimitive.Separator className={clsx(styles.separator, className)} />
  );
}

export function DropdownGroup({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DropdownPrimitive.Group>{children}</DropdownPrimitive.Group>;
}
