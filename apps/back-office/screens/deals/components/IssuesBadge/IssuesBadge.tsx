import React from 'react';
import s from './IssuesBadge.module.scss';
import clsx from 'clsx';

interface Props {
  count: number;
  isDraft?: boolean;
}

export const IssuesBadge = ({ count, isDraft }: Props) => {
  if (isDraft) {
    return <span className={s.dash}>-</span>;
  }

  const hasIssues = count > 0;

  return (
    <span className={clsx(s.badge, { [s.hasIssues]: hasIssues, [s.noIssues]: !hasIssues })}>
      {hasIssues ? (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="#ea580c" strokeWidth="1.4" />
            <path d="M8 5v3.5" stroke="#ea580c" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="8" cy="11" r="0.75" fill="#ea580c" />
          </svg>
          {count}
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="#059669" strokeWidth="1.4" />
            <path d="M5.5 8l2 2 3-3" stroke="#059669" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          No
        </>
      )}
    </span>
  );
};

export default IssuesBadge;
