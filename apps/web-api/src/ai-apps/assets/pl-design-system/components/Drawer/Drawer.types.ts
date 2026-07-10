import type { ReactNode } from 'react';

export type DrawerSide = 'right' | 'left';
export type DrawerSize = 'sm' | 'md' | 'lg' | 'full';

export interface DrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  side?: DrawerSide;
  size?: DrawerSize;
}

export interface DrawerHeaderProps {
  title?: string;
  children?: ReactNode;
  onClose?: () => void;
}

export interface DrawerBodyProps {
  children: ReactNode;
}

export interface DrawerFooterProps {
  children: ReactNode;
}
