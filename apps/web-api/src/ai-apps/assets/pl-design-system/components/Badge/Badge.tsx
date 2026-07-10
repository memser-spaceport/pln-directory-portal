import clsx from 'clsx';
import type { BadgeProps } from './Badge.types';
import styles from './Badge.module.scss';

export function Badge({
  color = 'blue',
  styleType = 'light',
  size = 'md',
  leftIcon,
  rightIcon,
  brandLogo,
  dot = false,
  disabled = false,
  className,
  children,
  ...props
}: BadgeProps) {
  const colorStyleKey = `${styleType}-${color}` as keyof typeof styles;

  return (
    <span
      className={clsx(
        styles.badge,
        styles[`size-${size}`],
        styles[colorStyleKey],
        disabled && styles.disabled,
        className,
      )}
      {...props}
    >
      {dot && <span className={styles.dotIndicator} aria-hidden />}
      {brandLogo && <span className={styles.iconSlot}>{brandLogo}</span>}
      {leftIcon && <span className={styles.iconSlot}>{leftIcon}</span>}
      {children}
      {rightIcon && <span className={styles.iconSlot}>{rightIcon}</span>}
    </span>
  );
}
