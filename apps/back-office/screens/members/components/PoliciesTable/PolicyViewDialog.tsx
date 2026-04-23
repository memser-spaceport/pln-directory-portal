import React, { useEffect, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import clsx from 'clsx';

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

// ─── Icons ────────────────────────────────────────────────────────────────────

const PolicyHeaderIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
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

const FolderIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const CalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const PeopleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const BookIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 004 22h16V2H6.5A2.5 2.5 0 004 4.5v15z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

const StarCalendarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 13l.9 2.6H16l-2.5 1.8.9 2.6L12 18.3l-2.4 1.7.9-2.6L8 15.6h3.1L12 13z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
  </svg>
);

const LayersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const GridIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

const TeamIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

// ─── Cell helpers ─────────────────────────────────────────────────────────────

function getPermissionIcon(perm: string) {
  const lower = perm.toLowerCase();
  if (lower.includes('directory')) return <FolderIcon />;
  if (lower.includes('hour') || lower.includes('office')) return <CalendarIcon />;
  if (lower.includes('forum') || lower.includes('chat') || lower.includes('message')) return <ChatIcon />;
  if (lower.includes('gathering') || lower.includes('irl') || lower.includes('member') || lower.includes('people')) return <PeopleIcon />;
  if (lower.includes('guide') || lower.includes('founder') || lower.includes('book') || lower.includes('doc')) return <BookIcon />;
  if (lower.includes('demo') || lower.includes('event') || lower.includes('day')) return <StarCalendarIcon />;
  if (lower.includes('all') || lower.includes('module')) return <LayersIcon />;
  return <GridIcon />;
}

const MemberNameCell = ({ member }: { member: Member }) => (
  <div className={s.memberNameCell}>
    <div className={s.avatar}>
      {member.image?.url ? (
        <img src={member.image.url} alt={member.name} />
      ) : (
        <div className={s.avatarPlaceholder}>{member.name.charAt(0)}</div>
      )}
    </div>
    <div className={s.memberText}>
      <span className={s.memberName}>{member.name}</span>
      <span className={s.memberEmail}>{member.email}</span>
    </div>
  </div>
);

const TeamProjectCell = ({ member }: { member: Member }) => {
  const items = [
    ...(member.teamMemberRoles ?? []).map((t) => ({ icon: <TeamIcon />, label: t.team.name })),
    ...member.projectContributions.map((c) => ({ icon: <ProjectIcon />, label: c.project.name })),
  ];
  if (!items.length) return <span className={s.muted}>—</span>;
  const visible = items.slice(0, 2);
  const overflow = items.length - 2;
  return (
    <div className={s.teamList}>
      {visible.map((item, i) => (
        <span key={i} className={s.teamBadge}>
          {item.icon}
          {item.label}
        </span>
      ))}
      {overflow > 0 && <span className={s.teamOverflow}>+{overflow}</span>}
    </div>
  );
};

const DateCell = ({ member }: { member: Member }) => {
  const dateObj = member.accessLevelUpdatedAt ? new Date(member.accessLevelUpdatedAt) : null;
  if (!dateObj) return <span className={s.muted}>—</span>;
  const dateLine = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeLine = dateObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  return (
    <div className={s.dateCell}>
      <span className={s.dateLine}>{dateLine}</span>
      <span className={s.timeLine}>{timeLine}</span>
    </div>
  );
};

// ─── TanStack Table setup ─────────────────────────────────────────────────────

const columnHelper = createColumnHelper<Member>();

const columns = [
  columnHelper.display({
    id: 'member',
    header: 'Members',
    size: 0, // flexible
    cell: (info) => <MemberNameCell member={info.row.original} />,
  }),
  columnHelper.display({
    id: 'teamProject',
    header: 'Team/Project',
    size: 220,
    cell: (info) => <TeamProjectCell member={info.row.original} />,
  }),
  columnHelper.display({
    id: 'date',
    header: 'Date',
    size: 120,
    cell: (info) => <DateCell member={info.row.original} />,
  }),
];

// ─── Component ────────────────────────────────────────────────────────────────

const PERMISSIONS_INITIAL_COUNT = 3;

export function PolicyViewDialog({ policy, members, isOpen, onClose }: Props) {
  const [memberSearch, setMemberSearch] = useState('');
  const [showAllPermissions, setShowAllPermissions] = useState(false);

  useEffect(() => {
    setShowAllPermissions(false);
    setMemberSearch('');
  }, [policy?.uid]);

  const policyMembers = members.filter((m) => m.policies?.some((p) => p.code === policy?.code));

  const table = useReactTable({
    data: policyMembers,
    columns,
    state: { globalFilter: memberSearch },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _colId, value: string) => {
      const q = value.toLowerCase();
      return (
        row.original.name.toLowerCase().includes(q) ||
        row.original.email.toLowerCase().includes(q)
      );
    },
    getRowId: (row) => row.uid,
  });

  if (!policy) return null;

  const rows = table.getRowModel().rows;

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
          ) : (() => {
            const hasMore = policy.permissions.length > PERMISSIONS_INITIAL_COUNT;
            const visible = showAllPermissions ? policy.permissions : policy.permissions.slice(0, PERMISSIONS_INITIAL_COUNT);
            return (
              <>
                <div className={s.permissionCards}>
                  {visible.map((perm) => (
                    <div key={perm} className={s.permissionCard}>
                      <div className={s.permissionCardLeft}>
                        <span className={s.permissionCardIcon}>{getPermissionIcon(perm)}</span>
                        <span className={s.permissionCardName}>{perm}</span>
                      </div>
                      <div className={s.permissionBadges}>
                        <span className={s.permissionBadge}>View</span>
                        <span className={s.permissionBadge}>Edit</span>
                      </div>
                    </div>
                  ))}
                </div>
                {hasMore && (
                  <div className={s.showAllRow}>
                    <button
                      type="button"
                      className={s.showAllBtn}
                      onClick={() => setShowAllPermissions((v) => !v)}
                    >
                      {showAllPermissions ? 'Show Less' : 'Show All'}
                    </button>
                  </div>
                )}
              </>
            );
          })()}
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

          <div className={s.memberTableWrap}>
            {/* Header row */}
            <div className={s.tableHeaderRow}>
              {table.getHeaderGroups().map((hg) =>
                hg.headers.map((header) => (
                  <div
                    key={header.id}
                    className={clsx(s.tableHeaderCell, {
                      [s.fixed]: !!header.column.columnDef.size,
                      [s.flexible]: !header.column.columnDef.size,
                    })}
                    style={{
                      width: header.column.getSize() || undefined,
                      flexBasis: header.column.getSize() || undefined,
                    }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </div>
                ))
              )}
            </div>

            {/* Body */}
            <div className={s.tableBody}>
              {rows.length === 0 ? (
                <div className={s.emptyState}>No members found.</div>
              ) : (
                rows.map((row) => (
                  <div key={row.id} className={s.tableBodyRow}>
                    {row.getVisibleCells().map((cell) => (
                      <div
                        key={cell.id}
                        className={clsx(s.tableBodyCell, {
                          [s.fixed]: !!cell.column.columnDef.size,
                          [s.flexible]: !cell.column.columnDef.size,
                        })}
                        style={{
                          width: cell.column.getSize() || undefined,
                          flexBasis: cell.column.getSize() || undefined,
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
