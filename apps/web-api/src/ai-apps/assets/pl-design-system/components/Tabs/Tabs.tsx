'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import clsx from 'clsx';
import { createContext, useContext } from 'react';
import type {
  TabsRootProps,
  TabsListProps,
  TabsTriggerProps,
  TabsContentProps,
  TabsVariant,
  TabsSize,
} from './Tabs.types';
import styles from './Tabs.module.scss';

interface TabsContextValue {
  variant: TabsVariant;
  size: TabsSize;
}

const TabsContext = createContext<TabsContextValue>({ variant: 'line', size: 'md' });

export function Tabs({
  variant = 'line',
  size = 'md',
  className,
  children,
  ...props
}: TabsRootProps) {
  return (
    <TabsContext.Provider value={{ variant, size }}>
      <TabsPrimitive.Root
        data-variant={variant}
        data-size={size}
        className={clsx(styles.root, className)}
        {...props}
      >
        {children}
      </TabsPrimitive.Root>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children, ...props }: TabsListProps) {
  const { variant } = useContext(TabsContext);
  const listVariantClass = styles[`list-${variant}` as keyof typeof styles];

  return (
    <TabsPrimitive.List
      className={clsx(styles.list, listVariantClass, className)}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  badge,
  icon,
  className,
  children,
  ...props
}: TabsTriggerProps) {
  const { variant } = useContext(TabsContext);
  const triggerVariantClass = styles[`trigger-${variant}` as keyof typeof styles];

  return (
    <TabsPrimitive.Trigger
      className={clsx(triggerVariantClass, className)}
      {...props}
    >
      <span className={styles.triggerInner}>
        {icon && icon}
        {children}
        {badge !== undefined && (
          <span className={styles.badge}>{badge}</span>
        )}
      </span>
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({ className, children, ...props }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      className={clsx(styles.content, className)}
      {...props}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
