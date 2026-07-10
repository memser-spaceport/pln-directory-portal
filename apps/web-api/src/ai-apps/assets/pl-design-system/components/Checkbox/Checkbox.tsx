'use client';

import React, { useId } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import clsx from 'clsx';
import type { CheckboxProps } from './Checkbox.types';
import styles from './Checkbox.module.scss';

const iconSizeMap = {
  sm: 12,
  md: 14,
  lg: 16,
} as const;

function CheckIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <polyline
        points="3,7 6,10 11,3"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function IndeterminateIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <line
        x1="3"
        y1="8"
        x2="13"
        y2="8"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Checkbox({
  size = 'md',
  label,
  description,
  id,
  className,
  ...props
}: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;
  const iconSize = iconSizeMap[size];

  const control = (
    <CheckboxPrimitive.Root
      id={checkboxId}
      className={clsx(styles.root, styles[`size-${size}`], className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={styles.indicator}>
        {props.checked === 'indeterminate' ? (
          <IndeterminateIcon size={iconSize} />
        ) : (
          <CheckIcon size={iconSize} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label && !description) {
    return control;
  }

  return (
    <div className={styles.wrapper}>
      {control}
      <div className={styles.textContent}>
        {label && (
          <label htmlFor={checkboxId} className={styles.label}>
            {label}
          </label>
        )}
        {description && <span className={styles.description}>{description}</span>}
      </div>
    </div>
  );
}
