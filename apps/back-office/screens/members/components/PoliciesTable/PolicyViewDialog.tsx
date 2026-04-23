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

const PolicyHeaderIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

const LayersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WrenchIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TeamIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ProjectIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

function getPermissionIcon(perm: string) {
  const lower = perm.toLowerCase();
  if (lower.includes('all') || lower.includes('module')) return <LayersIcon />;
  return <WrenchIcon />;
}

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
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.headerIconWrap}>
            <PolicyHeaderIcon />
          </div>
          <span className={s.headerTitle}>
            {policy.name} — {policy.group}
          </span>
        </div>
        <button type="button" className={s.closeBtn} onClick={onClose}>
          <XIcon />
        </button>
      </div>

      <div className={s.body}>
        {/* Description */}
        <section className={s.section}>
          <h4 className={s.sectionHeading}>Description</h4>
          <p className={s.descriptionText}>{policy.description ?? '—'}</p>
        </section>

        {/* Module Permissions */}
        <section className={s.section}>
          <h4 className={s.sectionHeading}>Module Permissions</h4>
          {policy.permissions.length === 0 ? (
            <p className={s.muted}>No permissions configured.</p>
          ) : (
            <div className={s.permissionCards}>
              {policy.permissions.map((perm) => (
                <div key={perm} className={s.permissionCard}>
                  <div className={s.permissionCardLeft}>
                    <span className={s.permissionCardIcon}>{getPermissionIcon(perm)}</span>
                    <span className={s.permissionCardName}>{perm}</span>
                  </div>
                  <div className={s.permissionBadges}>
                    <span className={s.permissionBadge}>View</span>
                    <span className={s.permissionBadge}>Edit</span>
                    <span className={s.permissionBadge}>Admin</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Members */}
        <section className={s.section}>
          <h4 className={s.sectionHeading}>Members ({policyMembers.length})</h4>

          <div className={s.memberSearchWrapper}>
            <span className={s.memberSearchIcon}>
              <SearchIcon />
            </span>
            <input
              className={s.memberSearch}
              placeholder="Search members"
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
            />
          </div>

          {filteredMembers.length === 0 ? (
            <p className={s.muted}>No members found.</p>
          ) : (
            <div className={s.memberTable}>
              {/* Column headers */}
              <div className={s.memberTableHeader}>
                <div className={s.colMember}>Members</div>
                <div className={s.colTeam}>Team/Project</div>
                <div className={s.colDate}>Date</div>
              </div>

              {/* Rows */}
              <div className={s.memberTableBody}>
                {filteredMembers.map((m) => {
                  const teams = m.teamMemberRoles ?? [];
                  const projects = m.projectContributions ?? [];

                  const dateObj = m.accessLevelUpdatedAt ? new Date(m.accessLevelUpdatedAt) : null;
                  const dateLine = dateObj
                    ? dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—';
                  const timeLine = dateObj
                    ? dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()
                    : null;

                  return (
                    <div key={m.uid} className={s.memberTableRow}>
                      <div className={s.colMember}>
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

                      <div className={s.colTeam}>
                        {teams.length === 0 && projects.length === 0 ? (
                          <span className={s.muted}>—</span>
                        ) : (
                          <div className={s.teamList}>
                            {teams.map((t) => (
                              <span key={t.team.uid} className={s.teamBadge}>
                                <TeamIcon />
                                {t.team.name}
                              </span>
                            ))}
                            {projects.map((c) => (
                              <span key={c.uid} className={s.teamBadge}>
                                <ProjectIcon />
                                {c.project.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className={s.colDate}>
                        <span className={s.dateLine}>{dateLine}</span>
                        {timeLine && <span className={s.timeLine}>{timeLine}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
