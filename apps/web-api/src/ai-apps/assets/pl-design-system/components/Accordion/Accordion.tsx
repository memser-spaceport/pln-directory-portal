'use client';

import * as AccordionPrimitive from '@radix-ui/react-accordion';
import clsx from 'clsx';
import type {
  AccordionRootProps,
  AccordionItemProps,
  AccordionTriggerProps,
  AccordionContentProps,
} from './Accordion.types';
import styles from './Accordion.module.scss';

const ChevronIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    aria-hidden="true"
    focusable="false"
  >
    <polyline
      points="4,6 8,10 12,6"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function Accordion({ className, ...props }: AccordionRootProps) {
  return (
    <AccordionPrimitive.Root
      className={clsx(styles.root, className)}
      {...props}
    />
  );
}

export function AccordionItem({ className, children, ...props }: AccordionItemProps) {
  return (
    <AccordionPrimitive.Item
      className={clsx(styles.item, className)}
      {...props}
    >
      {children}
    </AccordionPrimitive.Item>
  );
}

export function AccordionTrigger({ children, icon, className }: AccordionTriggerProps) {
  return (
    <AccordionPrimitive.Header asChild>
      <h3 style={{ margin: 0 }}>
        <AccordionPrimitive.Trigger className={clsx(styles.trigger, className)}>
          <span className={styles.triggerLeft}>
            {icon && <span className={styles.triggerIcon}>{icon}</span>}
            {children}
          </span>
          <span className={styles.chevron}>
            <ChevronIcon />
          </span>
        </AccordionPrimitive.Trigger>
      </h3>
    </AccordionPrimitive.Header>
  );
}

export function AccordionContent({ children, className }: AccordionContentProps) {
  return (
    <AccordionPrimitive.Content className={clsx(styles.content, className)}>
      <div className={styles.contentInner}>{children}</div>
    </AccordionPrimitive.Content>
  );
}
