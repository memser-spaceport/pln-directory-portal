'use client';

import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { AlertProps, AlertVariant } from './Alert.types';
import styles from './Alert.module.scss';

const InfoIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10" y1="9" x2="10" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="6.5" r="0.75" fill="currentColor" />
  </svg>
);

const SuccessIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
    <polyline points="6.5,10 9,12.5 13.5,7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WarningIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M10 3L18.5 17H1.5L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <line x1="10" y1="9" x2="10" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="10" cy="15.5" r="0.75" fill="currentColor" />
  </svg>
);

const ErrorIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="7" y1="7" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="13" y1="7" x2="7" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const defaultIcons: Record<AlertVariant, ReactNode> = {
  info: <InfoIcon />,
  success: <SuccessIcon />,
  warning: <WarningIcon />,
  error: <ErrorIcon />,
};

export function Alert({
  variant = 'info',
  styleType = 'light',
  title,
  description,
  icon,
  action,
  onClose,
  closable = false,
  className,
  ...props
}: AlertProps) {
  const variantStyleKey = `${variant}-${styleType}` as keyof typeof styles;
  const resolvedIcon = icon !== undefined ? icon : defaultIcons[variant];

  return (
    <div
      role="alert"
      className={clsx(styles.alert, styles[variantStyleKey], className)}
      {...props}
    >
      {resolvedIcon && <span className={styles.icon}>{resolvedIcon}</span>}
      <div className={styles.content}>
        {title && <div className={styles.title}>{title}</div>}
        {description && <div className={styles.description}>{description}</div>}
        {action && <div className={styles.action}>{action}</div>}
      </div>
      {(closable || onClose) && (
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Dismiss alert"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
