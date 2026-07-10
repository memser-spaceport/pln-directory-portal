'use client';

import { useState, KeyboardEvent } from 'react';
import clsx from 'clsx';
import type { PaginationProps } from './Pagination.types';
import styles from './Pagination.module.scss';

const DOTS = 'DOTS';

function usePaginationRange(
  currentPage: number,
  totalPages: number,
  siblingCount: number,
): (number | typeof DOTS)[] {
  if (totalPages <= 1) return [1];

  const range = (start: number, end: number) =>
    Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const totalPageNumbers = siblingCount * 2 + 5; // siblings + current + 2 dots + first + last

  if (totalPageNumbers >= totalPages) {
    return range(1, totalPages);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const showLeftDots = leftSiblingIndex > 2;
  const showRightDots = rightSiblingIndex < totalPages - 1;

  if (!showLeftDots && showRightDots) {
    const leftItemCount = 3 + 2 * siblingCount;
    return [...range(1, leftItemCount), DOTS, totalPages];
  }

  if (showLeftDots && !showRightDots) {
    const rightItemCount = 3 + 2 * siblingCount;
    return [1, DOTS, ...range(totalPages - rightItemCount + 1, totalPages)];
  }

  return [1, DOTS, ...range(leftSiblingIndex, rightSiblingIndex), DOTS, totalPages];
}

const ChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <polyline
      points="9,2 4,7 9,12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <polyline
      points="5,2 10,7 5,12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronLeftDouble = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <polyline
      points="8,2 3,7 8,12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polyline
      points="12,2 7,7 12,12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ChevronRightDouble = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <polyline
      points="6,2 11,7 6,12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polyline
      points="2,2 7,7 2,12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  variant = 'basic',
  siblingCount = 1,
  showFirstLast = false,
  className,
  ...props
}: PaginationProps) {
  const [gotoValue, setGotoValue] = useState('');
  const pageRange = usePaginationRange(currentPage, totalPages, siblingCount);

  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const handleGotoKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const page = parseInt(gotoValue, 10);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        onPageChange(page);
        setGotoValue('');
      }
    }
  };

  if (variant === 'compact') {
    return (
      <nav
        role="navigation"
        aria-label="Pagination"
        className={clsx(styles.root, className)}
        {...props}
      >
        <button
          className={styles.navButton}
          disabled={!canGoPrev}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </button>
        <span className={styles.compactInfo}>
          {currentPage} of {totalPages}
        </span>
        <button
          className={styles.navButton}
          disabled={!canGoNext}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </button>
      </nav>
    );
  }

  if (variant === 'goto') {
    return (
      <nav
        role="navigation"
        aria-label="Pagination"
        className={clsx(styles.root, className)}
        {...props}
      >
        <button
          className={styles.navButton}
          disabled={!canGoPrev}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft />
        </button>
        <span className={styles.compactInfo}>
          {currentPage} of {totalPages}
        </span>
        <button
          className={styles.navButton}
          disabled={!canGoNext}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next page"
        >
          <ChevronRight />
        </button>
        <span className={styles.gotoWrapper}>
          <span>Go to</span>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={gotoValue}
            onChange={(e) => setGotoValue(e.target.value)}
            onKeyDown={handleGotoKeyDown}
            className={styles.gotoInput}
            aria-label="Go to page"
          />
        </span>
      </nav>
    );
  }

  // 'basic' and 'with-text' variants
  return (
    <nav
      role="navigation"
      aria-label="Pagination"
      className={clsx(styles.root, className)}
      {...props}
    >
      {showFirstLast && (
        <button
          className={styles.navButton}
          disabled={!canGoPrev}
          onClick={() => onPageChange(1)}
          aria-label="First page"
        >
          <ChevronLeftDouble />
        </button>
      )}
      <button
        className={styles.navButton}
        disabled={!canGoPrev}
        onClick={() => onPageChange(currentPage - 1)}
        aria-label="Previous page"
      >
        {variant === 'with-text' ? (
          <>
            <ChevronLeft />
            <span>Prev</span>
          </>
        ) : (
          <ChevronLeft />
        )}
      </button>

      {pageRange.map((page, index) => {
        if (page === DOTS) {
          return (
            <span key={`dots-${index}`} className={styles.dots} aria-hidden="true">
              &hellip;
            </span>
          );
        }
        return (
          <button
            key={page}
            className={clsx(styles.button, { [styles.active]: page === currentPage })}
            onClick={() => onPageChange(page)}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? 'page' : undefined}
          >
            {page}
          </button>
        );
      })}

      <button
        className={styles.navButton}
        disabled={!canGoNext}
        onClick={() => onPageChange(currentPage + 1)}
        aria-label="Next page"
      >
        {variant === 'with-text' ? (
          <>
            <span>Next</span>
            <ChevronRight />
          </>
        ) : (
          <ChevronRight />
        )}
      </button>
      {showFirstLast && (
        <button
          className={styles.navButton}
          disabled={!canGoNext}
          onClick={() => onPageChange(totalPages)}
          aria-label="Last page"
        >
          <ChevronRightDouble />
        </button>
      )}
    </nav>
  );
}
