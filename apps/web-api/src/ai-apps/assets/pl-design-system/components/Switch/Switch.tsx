'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import clsx from 'clsx';
import type { SwitchProps } from './Switch.types';
import styles from './Switch.module.scss';

export function Switch({
  size = 'md',
  label,
  labelPosition = 'right',
  description,
  disabled,
  className,
  ...props
}: SwitchProps) {
  const control = (
    <SwitchPrimitive.Root
      disabled={disabled}
      className={clsx(styles.root, styles[`size-${size}`], className)}
      {...props}
    >
      <SwitchPrimitive.Thumb className={styles.thumb} />
    </SwitchPrimitive.Root>
  );

  if (!label && !description) {
    return control;
  }

  const textContent = (
    <div className={styles.textContent}>
      {label && <span className={styles.label}>{label}</span>}
      {description && <span className={styles.description}>{description}</span>}
    </div>
  );

  return (
    <div className={clsx(styles.wrapper, disabled && styles['wrapper-disabled'])}>
      {labelPosition === 'left' && textContent}
      {control}
      {labelPosition === 'right' && textContent}
    </div>
  );
}
