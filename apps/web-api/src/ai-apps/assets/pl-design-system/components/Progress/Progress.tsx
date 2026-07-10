'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import clsx from 'clsx';
import type { ProgressProps } from './Progress.types';
import styles from './Progress.module.scss';

export function Progress({
  value = 0,
  max = 100,
  color = 'blue',
  size = 'md',
  label,
  showValue = false,
  animated = false,
  className,
}: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={clsx(styles.wrapper, className)}>
      {(label || showValue) && (
        <div className={styles.header}>
          {label && <span className={styles.label}>{label}</span>}
          {showValue && (
            <span className={styles.valueText}>{Math.round(percentage)}%</span>
          )}
        </div>
      )}
      <ProgressPrimitive.Root
        className={clsx(styles.root, styles[`size-${size}`])}
        value={value}
        max={max}
      >
        <ProgressPrimitive.Indicator
          className={clsx(
            styles.indicator,
            styles[color],
            animated && styles.animated,
          )}
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
}
