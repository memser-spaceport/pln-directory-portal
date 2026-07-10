'use client';

import * as Dialog from '@radix-ui/react-dialog';
import clsx from 'clsx';
import type { DrawerProps, DrawerHeaderProps, DrawerBodyProps, DrawerFooterProps } from './Drawer.types';
import styles from './Drawer.module.scss';

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <line x1="3" y1="3" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13" y1="3" x2="3" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Drawer({
  open,
  onOpenChange,
  children,
  side = 'right',
  size = 'md',
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={clsx(styles.content, styles[side], styles[size])}
          aria-describedby={undefined}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DrawerTrigger({ children }: { children: React.ReactNode }) {
  return <Dialog.Trigger asChild>{children}</Dialog.Trigger>;
}

export function DrawerClose({ children }: { children: React.ReactNode }) {
  return <Dialog.Close asChild>{children}</Dialog.Close>;
}

export function DrawerHeader({ title, children, onClose }: DrawerHeaderProps) {
  return (
    <div className={styles.header}>
      {title && (
        <Dialog.Title className={styles.title}>{title}</Dialog.Title>
      )}
      {children}
      {onClose && (
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close drawer"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}

export function DrawerBody({ children }: DrawerBodyProps) {
  return <div className={styles.body}>{children}</div>;
}

export function DrawerFooter({ children }: DrawerFooterProps) {
  return <div className={styles.footer}>{children}</div>;
}
