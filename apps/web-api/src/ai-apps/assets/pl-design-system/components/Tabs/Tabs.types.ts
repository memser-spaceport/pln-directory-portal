import type * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

export type TabsVariant = 'line' | 'enclosed' | 'pill';
export type TabsSize = 'sm' | 'md' | 'lg';

export interface TabsRootProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {
  variant?: TabsVariant;
  size?: TabsSize;
}

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  badge?: number | string;
  icon?: ReactNode;
}

export interface TabsContentProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content> {}

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {}
