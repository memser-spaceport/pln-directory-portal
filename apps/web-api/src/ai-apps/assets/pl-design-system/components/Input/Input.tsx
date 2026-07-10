'use client';

import React from 'react';
import clsx from 'clsx';
import type { InputProps } from './Input.types';
import styles from './Input.module.scss';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  function Input(
    {
      label,
      hint,
      error,
      size = 'md',
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      id,
      className,
      ...props
    },
    ref,
  ) {
    const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
    const hasError = Boolean(error);

    return (
      <div className={clsx(styles.wrapper, fullWidth && styles.fullWidth)}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}

        <div className={styles.inputWrapper}>
          {leftIcon && (
            <span className={styles.iconLeft} aria-hidden>
              {leftIcon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            data-error={hasError || undefined}
            className={clsx(
              styles.input,
              styles[`size-${size}`],
              leftIcon && styles.hasLeftIcon,
              rightIcon && styles.hasRightIcon,
              className,
            )}
            aria-invalid={hasError || undefined}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />

          {rightIcon && (
            <span className={styles.iconRight} aria-hidden>
              {rightIcon}
            </span>
          )}
        </div>

        {error && (
          <span id={`${inputId}-error`} className={styles.errorMessage} role="alert">
            {error}
          </span>
        )}
        {!error && hint && (
          <span id={`${inputId}-hint`} className={styles.hint}>
            {hint}
          </span>
        )}
      </div>
    );
  },
);
