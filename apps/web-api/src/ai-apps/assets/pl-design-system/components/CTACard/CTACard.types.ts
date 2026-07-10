import type { ReactNode, HTMLAttributes } from 'react';

export interface CTACardProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title: string;
  description?: string;
  href?: string;
  onClick?: () => void;
}

export interface CTACardGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}
