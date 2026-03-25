import React, { useEffect, useRef, useState } from 'react';
import { IssueStatus, ReportedIssue } from '../../types/deal';
import s from '../ActionMenu/ActionMenu.module.scss';

interface Props {
  issue: ReportedIssue;
  onStatusChange: (uid: string, status: IssueStatus) => void;
  onView: (issue: ReportedIssue) => void;
  onDeactivateDeal: (dealUid: string) => void;
}

export const IssueActionMenu = ({ issue, onStatusChange, onView, onDeactivateDeal }: Props) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className={s.root} ref={ref}>
      <button className={s.trigger} onClick={() => setOpen((v) => !v)} aria-label="Actions">
        <span className={s.dot} />
        <span className={s.dot} />
        <span className={s.dot} />
      </button>
      {open && (
        <div className={s.menu}>
          <button
            className={s.item}
            onClick={() => {
              setOpen(false);
              onView(issue);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z"
                stroke="#64748b"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="8" cy="8" r="2" stroke="#64748b" strokeWidth="1.2" />
            </svg>
            View Issue
          </button>
          {issue.status === 'OPEN' ? (
            <button
              className={s.item}
              onClick={() => {
                setOpen(false);
                onStatusChange(issue.uid, 'RESOLVED');
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M17.9425 6.06754L7.94254 16.0675C7.88449 16.1256 7.81556 16.1717 7.73969 16.2032C7.66381 16.2347 7.58248 16.2508 7.50035 16.2508C7.41821 16.2508 7.33688 16.2347 7.26101 16.2032C7.18514 16.1717 7.11621 16.1256 7.05816 16.0675L2.68316 11.6925C2.56588 11.5753 2.5 11.4162 2.5 11.2503C2.5 11.0845 2.56588 10.9254 2.68316 10.8082C2.80044 10.6909 2.9595 10.625 3.12535 10.625C3.2912 10.625 3.45026 10.6909 3.56753 10.8082L7.50035 14.7418L17.0582 5.18316C17.1754 5.06588 17.3345 5 17.5003 5C17.6662 5 17.8253 5.06588 17.9425 5.18316C18.0598 5.30044 18.1257 5.4595 18.1257 5.62535C18.1257 5.7912 18.0598 5.95026 17.9425 6.06754Z"
                  fill="#455468"
                />
              </svg>
              Mark as resolved
            </button>
          ) : (
            <button
              className={s.item}
              onClick={() => {
                setOpen(false);
                onStatusChange(issue.uid, 'OPEN');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M2 14l4.5-4.5M14 2L9.5 6.5M2 2l12 12"
                  stroke="#64748b"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Reopen
            </button>
          )}
          {issue.deal.status !== 'DEACTIVATED' && (
            <button
              className={s.item}
              onClick={() => {
                setOpen(false);
                onDeactivateDeal(issue.dealUid);
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="#64748b" strokeWidth="1.2" />
                <path d="M10 6L6 10M6 6l4 4" stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
              Deactivate Deal
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default IssueActionMenu;
