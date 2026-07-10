'use client';

import React from 'react';
import clsx from 'clsx';
import type { TextareaProps } from './Textarea.types';
import styles from './Textarea.module.scss';

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label,
      hint,
      error,
      rows = 4,
      resize = 'vertical',
      fullWidth = false,
      disabled,
      id,
      className,
      ...props
    },
    ref,
  ) {
    const textareaId = id ?? (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
    const hasError = Boolean(error);

    return (
      <div className={clsx(styles.wrapper, fullWidth && styles.fullWidth)}>
        {label && (
          <label htmlFor={textareaId} className={styles.label}>
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          disabled={disabled}
          data-error={hasError || undefined}
          className={clsx(
            styles.textarea,
            styles[`resize-${resize}`],
            className,
          )}
          aria-invalid={hasError || undefined}
          aria-describedby={
            error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined
          }
          {...props}
        />

        {error && (
          <span id={`${textareaId}-error`} className={styles.errorMessage} role="alert">
            {error}
          </span>
        )}
        {!error && hint && (
          <span id={`${textareaId}-hint`} className={styles.hint}>
            {hint}
          </span>
        )}
      </div>
    );
  },
);
