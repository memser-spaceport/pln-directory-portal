import clsx from 'clsx';
import type {
  TableProps,
  TableHeadProps,
  TableBodyProps,
  TableRowProps,
  TableHeaderProps,
  TableCellProps,
} from './Table.types';
import styles from './Table.module.scss';

const SortAscIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M7 3L10 7H4L7 3Z" fill="currentColor" />
    <path d="M7 11L4 7H10L7 11Z" fill="currentColor" opacity="0.3" />
  </svg>
);

const SortDescIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M7 3L10 7H4L7 3Z" fill="currentColor" opacity="0.3" />
    <path d="M7 11L4 7H10L7 11Z" fill="currentColor" />
  </svg>
);

const SortDefaultIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M7 3L10 7H4L7 3Z" fill="currentColor" />
    <path d="M7 11L4 7H10L7 11Z" fill="currentColor" />
  </svg>
);

export function Table({ fullWidth = false, className, children, ...props }: TableProps) {
  return (
    <div className={clsx(styles.wrapper, className)}>
      <table className={clsx(styles.table, fullWidth && styles.fullWidth)} {...props}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ className, children, ...props }: TableHeadProps) {
  return (
    <thead className={clsx(styles.thead, className)} {...props}>
      {children}
    </thead>
  );
}

export function TableBody({ className, children, ...props }: TableBodyProps) {
  return (
    <tbody className={clsx(styles.tbody, className)} {...props}>
      {children}
    </tbody>
  );
}

export function TableRow({ selected = false, className, children, ...props }: TableRowProps) {
  return (
    <tr
      className={clsx(styles.row, selected && styles.selected, className)}
      aria-selected={selected}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHeader({
  sortable = false,
  sorted = false,
  onSort,
  className,
  children,
  ...props
}: TableHeaderProps) {
  const SortIcon = sorted === 'asc' ? SortAscIcon : sorted === 'desc' ? SortDescIcon : SortDefaultIcon;

  return (
    <th
      className={clsx(styles.th, sortable && styles.sortable, sorted && styles.sorted, className)}
      onClick={sortable ? onSort : undefined}
      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
      {...props}
    >
      <span className={styles.thInner}>
        {children}
        {sortable && (
          <span className={styles.sortIcon}>
            <SortIcon />
          </span>
        )}
      </span>
    </th>
  );
}

export function TableCell({ className, children, ...props }: TableCellProps) {
  return (
    <td className={clsx(styles.td, className)} {...props}>
      {children}
    </td>
  );
}
