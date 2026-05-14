import React from 'react';
import { clsx } from 'clsx';
import { FieldEntry } from '../../../hooks/teams/useTeamsEnrichmentReview';
import s from '../data-quality.module.scss';

interface Props {
  entry: FieldEntry;
}

export function FieldStatusCell({ entry }: Props) {
  const isHigh = (entry.judgment?.score ?? 0) >= 50;
  const isEnriched = entry.promotable;

  return (
    <div className={s.fieldCell}>
      {isEnriched ? (
        <span className={clsx(s.sourceBadge, s.sourceBadgeAI)}>
          <AIIcon />
        </span>
      ) : (
        <span className={clsx(s.sourceBadge, s.sourceBadgeUser)}>
          <UserIcon />
        </span>
      )}
      <span className={clsx(s.evalBadge, isHigh ? s.evalHigh : s.evalLow)}>
        <span className={s.evalDot} />
        {isHigh ? 'High' : 'Low'}
      </span>
    </div>
  );
}

export const AIIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5L8 1z" fill="currentColor" />
    <path
      d="M13 10l.75 1.75L15.5 12.5l-1.75.75L13 15l-.75-1.75L10.5 12.5l1.75-.75L13 10z"
      fill="currentColor"
      opacity="0.7"
    />
  </svg>
);

export const UserIcon = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8 8a3 3 0 100-6 3 3 0 000 6zM2 14c0-3.314 2.686-5 6-5s6 1.686 6 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
