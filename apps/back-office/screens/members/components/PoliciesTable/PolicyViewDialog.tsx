import React, { useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  PaginationState,
  useReactTable,
} from '@tanstack/react-table';
import clsx from 'clsx';

import Modal from '../../../../components/modal/modal';
import { Policy } from '../../../../hooks/access-control/usePoliciesList';
import { Member } from '../../types/member';
import { useMembersList } from '../../../../hooks/members/useMembersList';
import PaginationControls from '../PaginationControls/PaginationControls';
import s from './PolicyViewDialog.module.scss';

const MEMBER_SEARCH_DEBOUNCE_MS = 300;

interface Props {
  policy: Policy | null;
  authToken: string | undefined;
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

const ChevronIcon = ({ isOpen }: { isOpen: boolean }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
  >
    <path d="M3.33301 5.33337L7.99967 10L12.6663 5.33337" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function getModuleIcon(module: string) {
  switch (module) {
    case 'Directory':
      return <FolderIcon />;
    case 'Office Hours':
      return <CalendarIcon />;
    case 'Forum':
      return <ChatIcon />;
    case 'IRL Gatherings':
      return <PeopleIcon />;
    case 'Founder Guides':
      return <BookIcon />;
    case 'PL Demo Day':
    case 'Partner Demo Day':
      return <StarCalendarIcon />;
    case 'Admin Tool':
      return <LayersIcon />;
    default:
      return <GridIcon />;
  }
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

const MODULES_INITIAL_COUNT = 6;

export function PolicyViewDialog({ policy, authToken, isOpen, onClose }: Props) {
  const [memberSearchRaw, setMemberSearchRaw] = useState('');
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState('');
  const [showAllModules, setShowAllModules] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [dialogPagination, setDialogPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 12 });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedMemberSearch(memberSearchRaw.trim()), MEMBER_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [memberSearchRaw]);

  useEffect(() => {
    setDialogPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [debouncedMemberSearch]);

  useEffect(() => {
    setShowAllModules(false);
    setExpandedModules(new Set());
    setMemberSearchRaw('');
    setDebouncedMemberSearch('');
    setDialogPagination({ pageIndex: 0, pageSize: 12 });
  }, [policy?.uid]);

  const { data: assigneesData } = useMembersList(
    {
      authToken,
      memberState: ['APPROVED'],
      policyCodes: policy ? [policy.code] : undefined,
      page: dialogPagination.pageIndex + 1,
      limit: dialogPagination.pageSize,
      search: debouncedMemberSearch || undefined,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    },
    { enabled: !!authToken && !!policy?.code && isOpen, keepPrevious: false }
  );

  const modulesWithPermissions = useMemo(() => {
    if (!policy) return [];
    const grouped = new Map<
      string,
      Array<{ uid: string; code: string; module: string; description: string | null }>
    >();
    for (const permission of policy.permissionItems) {
      const current = grouped.get(permission.module);
      if (current) {
        current.push(permission);
      } else {
        grouped.set(permission.module, [permission]);
      }
    }
    return Array.from(grouped.entries())
      .map(([module, permissions]) => ({
        module,
        permissions: permissions.slice().sort((a, b) => a.code.localeCompare(b.code)),
      }))
      .sort((a, b) => a.module.localeCompare(b.module));
  }, [policy]);

  const policyMembers = assigneesData?.data ?? [];
  const totalAssigned = assigneesData?.pagination.total ?? 0;
  const dialogPageCount = assigneesData?.pagination.pages ?? 1;

  const table = useReactTable({
    data: policyMembers,
    columns,
    state: { pagination: dialogPagination },
    onPaginationChange: setDialogPagination,
    manualPagination: true,
    pageCount: dialogPageCount,
    getCoreRowModel: getCoreRowModel(),
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
          {modulesWithPermissions.length === 0 ? (
            <p className={s.muted}>No permissions configured.</p>
          ) : (() => {
            const hasMore = modulesWithPermissions.length > MODULES_INITIAL_COUNT;
            const visible = showAllModules
              ? modulesWithPermissions
              : modulesWithPermissions.slice(0, MODULES_INITIAL_COUNT);
            return (
              <>
                <div className={s.moduleCards}>
                  {visible.map(({ module, permissions }) => {
                    const isOpen = expandedModules.has(module);
                    return (
                      <div key={module} className={s.moduleCard}>
                        <button
                          type="button"
                          className={s.moduleHeader}
                          onClick={() =>
                            setExpandedModules((current) => {
                              const next = new Set(current);
                              if (next.has(module)) {
                                next.delete(module);
                              } else {
                                next.add(module);
                              }
                              return next;
                            })
                          }
                        >
                          <div className={s.moduleHeaderLeft}>
                            <span className={s.permissionCardIcon}>{getModuleIcon(module)}</span>
                            <span className={s.moduleName}>{module}</span>
                            <span className={s.moduleCount}>{permissions.length}</span>
                          </div>
                          <span className={s.moduleChevron}>
                            <ChevronIcon isOpen={isOpen} />
                          </span>
                        </button>
                        {isOpen && (
                          <div className={s.modulePermissions}>
                            {permissions.map((permission) => (
                              <div key={permission.code} className={s.permissionRow}>
                                <span className={s.permissionCode}>{permission.code}</span>
                                {permission.description ? (
                                  <span className={s.permissionDescription}>{permission.description}</span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {hasMore && (
                  <div className={s.showAllRow}>
                    <button
                      type="button"
                      className={s.showAllBtn}
                      onClick={() => setShowAllModules((current) => !current)}
                    >
                      {showAllModules ? 'Show Less' : 'Show All'}
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </section>

        {/* Members */}
        <section className={s.section}>
          <h4 className={s.sectionHeading}>Members ({totalAssigned.toLocaleString()})</h4>

          <div className={s.memberSearchWrapper}>
            <span className={s.memberSearchIcon}>
              <SearchIcon />
            </span>
            <input
              className={s.memberSearch}
              placeholder="Search members"
              value={memberSearchRaw}
              onChange={(e) => setMemberSearchRaw(e.target.value)}
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
          {dialogPageCount > 0 ? <PaginationControls table={table} /> : null}
        </section>
      </div>
    </Modal>
  );
}
