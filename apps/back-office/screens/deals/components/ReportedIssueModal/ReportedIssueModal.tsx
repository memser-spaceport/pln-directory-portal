import React from 'react';
import clsx from 'clsx';
import { IssueStatus, ReportedIssue } from '../../types/deal';
import s from './ReportedIssueModal.module.scss';

interface Props {
  issue: ReportedIssue;
  isUpdating: boolean;
  onClose: () => void;
  onStatusChange: (uid: string, status: IssueStatus) => void;
}

export const ReportedIssueModal = ({ issue, isUpdating, onClose, onStatusChange }: Props) => {
  const isOpen = issue.status === 'OPEN';
  const reportedDate = new Date(issue.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleResolve = () => {
    onStatusChange(issue.uid, 'RESOLVED');
  };

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <div className={s.header}>
          <div className={s.headerLeft}>
            <div className={s.titleRow}>
              <h4 className={s.title}>Reported Issue</h4>
              <span
                className={clsx(s.statusBadge, {
                  [s.statusOpen]: isOpen,
                  [s.statusResolved]: !isOpen,
                })}
              >
                {isOpen ? 'Open' : 'Resolved'}
              </span>
            </div>
            <p className={s.subtitle}>Reported on {reportedDate}</p>
          </div>
          <button type="button" className={s.closeBtn} onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="#455468" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className={s.body}>
          {/* Reported by */}
          <div className={s.section}>
            <p className={s.sectionLabel}>Reported by</p>
            <div className={s.personRow}>
              <div className={s.personAvatar}>
                {issue.authorMember.name.charAt(0).toUpperCase()}
              </div>
              <div className={s.personInfo}>
                <span className={s.personName}>{issue.authorMember.name}</span>
                <span className={s.personEmail}>{issue.authorMember.email}</span>
              </div>
            </div>
          </div>

          {/* Deal */}
          <div className={s.section}>
            <p className={s.sectionLabel}>Deal</p>
            <div className={s.dealRow}>
              <div className={s.dealAvatar}>
                {issue.deal.vendorName.charAt(0).toUpperCase()}
              </div>
              <div className={s.dealInfo}>
                <span className={s.dealName}>{issue.deal.vendorName}</span>
                <span className={s.dealDesc}>{issue.deal.category}</span>
              </div>
            </div>
          </div>

          {/* Issue Description */}
          <div className={s.section}>
            <p className={s.sectionLabel}>Issue Description</p>
            <p className={s.descriptionText}>{issue.description}</p>
          </div>
        </div>

        {isOpen && (
          <div className={s.footer}>
            <button type="button" className={s.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className={s.resolveBtn}
              onClick={handleResolve}
              disabled={isUpdating}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3.5 8.5l3 3 6-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isUpdating ? 'Resolving...' : 'Mark as Resolved'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportedIssueModal;
