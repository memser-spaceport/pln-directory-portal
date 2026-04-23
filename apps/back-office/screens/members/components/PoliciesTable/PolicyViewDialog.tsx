import React, { useState } from 'react';

import Modal from '../../../../components/modal/modal';
import { Policy } from '../../../../hooks/access-control/usePoliciesList';
import { Member } from '../../types/member';
import s from './PolicyViewDialog.module.scss';

interface Props {
  policy: Policy | null;
  members: Member[];
  isOpen: boolean;
  onClose: () => void;
}

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2L3 7V12C3 16.55 6.84 20.74 12 22C17.16 20.74 21 16.55 21 12V7L12 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M9 12L11 14L15 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const XIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.5 14.5L10.5 10.5M11.5 6.5C11.5 9.26142 9.26142 11.5 6.5 11.5C3.73858 11.5 1.5 9.26142 1.5 6.5C1.5 3.73858 3.73858 1.5 6.5 1.5C9.26142 1.5 11.5 3.73858 11.5 6.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function PolicyViewDialog({ policy, members, isOpen, onClose }: Props) {
  const [memberSearch, setMemberSearch] = useState('');

  if (!policy) return null;

  const policyMembers = members.filter((m) => m.policies?.some((p) => p.code === policy.code));

  const filteredMembers = memberSearch
    ? policyMembers.filter((m) => {
        const q = memberSearch.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
      })
    : policyMembers;

  return (
    <Modal isOpen={isOpen} onClose={onClose} modalClassName={s.modal}>
      <div className={s.header}>
        <div className={s.headerTitle}>
          <ShieldIcon />
          <span>
            {policy.name} — {policy.group}
          </span>
        </div>
        <button type="button" className={s.closeBtn} onClick={onClose}>
          <XIcon />
        </button>
      </div>

      <div className={s.body}>
        <section className={s.section}>
          <h4 className={s.sectionLabel}>Description</h4>
          <p className={s.descriptionText}>{policy.description ?? '—'}</p>
        </section>

        <section className={s.section}>
          <h4 className={s.sectionLabel}>Module Permissions</h4>
          {policy.permissions.length === 0 ? (
            <p className={s.muted}>No permissions</p>
          ) : (
            <ul className={s.permissionList}>
              {policy.permissions.map((perm) => (
                <li key={perm} className={s.permissionRow}>
                  <ShieldIcon />
                  <span>{perm}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={s.section}>
          <h4 className={s.sectionLabel}>Members ({policyMembers.length})</h4>
          <div className={s.memberSearchWrapper}>
            <span className={s.memberSearchIcon}>
              <SearchIcon />
            </span>
            <input
              className={s.memberSearch}
              placeholder="Search members..."
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
          </div>

          {filteredMembers.length === 0 ? (
            <p className={s.muted}>No members found.</p>
          ) : (
            <div className={s.memberList}>
              {filteredMembers.map((m) => {
                const teams = [
                  ...m.projectContributions.map((c) => c.project.name),
                  ...(m.teamMemberRoles ?? []).map((t) => t.team.name),
                ];
                const dateStr = m.accessLevelUpdatedAt
                  ? new Date(m.accessLevelUpdatedAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—';

                return (
                  <div key={m.uid} className={s.memberRow}>
                    <div className={s.memberInfo}>
                      <div className={s.avatar}>
                        {m.image?.url ? (
                          <img src={m.image.url} alt={m.name} />
                        ) : (
                          <div className={s.avatarPlaceholder}>{m.name.charAt(0)}</div>
                        )}
                      </div>
                      <div className={s.memberText}>
                        <span className={s.memberName}>{m.name}</span>
                        <span className={s.memberEmail}>{m.email}</span>
                      </div>
                    </div>
                    <div className={s.memberTeams}>{teams.slice(0, 2).join(', ') || '—'}</div>
                    <div className={s.memberDate}>{dateStr}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
