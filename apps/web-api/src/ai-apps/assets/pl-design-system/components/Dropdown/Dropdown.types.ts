import type * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

export interface DropdownProps {
  children: ReactNode;
  trigger: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export interface DropdownItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> {
  icon?: ReactNode;
  rightContent?: ReactNode;
}

export interface DropdownLabelProps {
  children: ReactNode;
  className?: string;
}

export interface DropdownSeparatorProps {
  className?: string;
}
