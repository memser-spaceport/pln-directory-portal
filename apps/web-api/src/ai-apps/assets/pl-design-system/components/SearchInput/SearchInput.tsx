'use client';

import clsx from 'clsx';
import type { SearchInputProps } from './SearchInput.types';
import styles from './SearchInput.module.scss';

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
    <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export function SearchInput({
  variant = 'default',
  onClear,
  loading = false,
  fullWidth = false,
  className,
  value,
  ...props
}: SearchInputProps) {
  const showClear = Boolean(value) && Boolean(onClear) && !loading;

  return (
    <div className={clsx(styles.wrapper, fullWidth && styles.fullWidth, className)}>
      <span className={styles.searchIcon}>
        <SearchIcon />
      </span>
      <input
        className={clsx(styles.input, variant === 'underline' && styles.underline)}
        value={value}
        {...props}
      />
      {loading && <span className={styles.spinner} aria-label="Loading" role="status" />}
      {showClear && (
        <button
          type="button"
          className={styles.clearButton}
          onClick={onClear}
          aria-label="Clear search"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  );
}
