import type { ReactNode, HTMLAttributes } from 'react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';
export type AlertStyle = 'light' | 'filled' | 'outline';

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  styleType?: AlertStyle;
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  closable?: boolean;
}
