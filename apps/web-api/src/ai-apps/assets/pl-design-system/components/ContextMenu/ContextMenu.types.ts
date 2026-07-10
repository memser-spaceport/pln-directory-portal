import type * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import type { ReactNode } from 'react';

export interface ContextMenuProps {
  children: ReactNode;
}

export interface ContextMenuItemProps
  extends React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> {
  icon?: ReactNode;
  shortcut?: string;
}

export interface ContextMenuSubProps
  extends React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Sub> {}

export interface ContextMenuSubTriggerProps
  extends React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> {
  icon?: ReactNode;
}
