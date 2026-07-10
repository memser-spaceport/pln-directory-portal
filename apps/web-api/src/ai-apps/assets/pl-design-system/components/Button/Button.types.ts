import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'warning' | 'error' | 'success' | 'neutral';
export type ButtonStyle = 'fill' | 'border' | 'light';
export type ButtonSize = 'tiny' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'big';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  styleType?: ButtonStyle;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}
