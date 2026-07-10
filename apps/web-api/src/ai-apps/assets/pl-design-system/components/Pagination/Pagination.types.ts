import type { HTMLAttributes } from 'react';

export type PaginationVariant = 'basic' | 'with-text' | 'compact' | 'goto';

export interface PaginationProps extends HTMLAttributes<HTMLElement> {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  variant?: PaginationVariant;
  siblingCount?: number;
  showFirstLast?: boolean;
}
