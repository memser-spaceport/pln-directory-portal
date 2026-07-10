import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeColor = 'blue' | 'gray' | 'green' | 'yellow' | 'red';
export type BadgeStyle = 'light' | 'outline' | 'fill';
export type BadgeSize = 'sm' | 'md' | 'lg';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
  styleType?: BadgeStyle;
  size?: BadgeSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  brandLogo?: ReactNode;
  dot?: boolean;
  disabled?: boolean;
  children: ReactNode;
}

export interface BadgeDotProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor | 'light' | 'light-secondary';
  size?: 'sm' | 'md' | 'lg';
}
