import React from 'react';
import s from './IssuesBadge.module.scss';
import clsx from 'clsx';

interface Props {
  count: number;
}

export const IssuesBadge = ({ count }: Props) => {
  const hasIssues = count > 0;

  return (
    <span className={clsx(s.badge, { [s.hasIssues]: hasIssues, [s.noIssues]: !hasIssues })}>
      {hasIssues ? `⚠ ${count}` : '✓ No'}
    </span>
  );
};

export default IssuesBadge;
