'use client';

import clsx from 'clsx';
import type { ButtonProps } from './Button.types';
import styles from './Button.module.scss';

const sizeMap = {
  tiny: styles['size-tiny'],
  xs: styles['size-xs'],
  sm: styles['size-sm'],
  md: styles['size-md'],
  lg: styles['size-lg'],
  xl: styles['size-xl'],
  big: styles['size-big'],
};

export function Button({
  variant = 'primary',
  styleType = 'fill',
  size = 'md',
  leftIcon,
  rightIcon,
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const variantStyleKey = `${variant}-${styleType}` as keyof typeof styles;

  return (
    <button
      className={clsx(
        styles.button,
        sizeMap[size],
        styles[variantStyleKey],
        fullWidth && styles.fullWidth,
        className,
      )}
      disabled={disabled || loading}
      aria-disabled={disabled || loading}
      {...props}
    >
      {leftIcon && <span className={styles.icon}>{leftIcon}</span>}
      {children}
      {rightIcon && <span className={styles.icon}>{rightIcon}</span>}
    </button>
  );
}
