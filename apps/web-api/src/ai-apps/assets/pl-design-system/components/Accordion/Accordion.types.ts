import type * as AccordionPrimitive from '@radix-ui/react-accordion';
import type { ReactNode } from 'react';

export interface AccordionRootProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Root> {}

export interface AccordionItemProps
  extends React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item> {
  children: ReactNode;
}

export interface AccordionTriggerProps {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export interface AccordionContentProps {
  children: ReactNode;
  className?: string;
}
