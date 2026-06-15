import clsx from 'clsx';
import { toast } from 'react-toastify';
import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, PaginationState, useReactTable } from '@tanstack/react-table';

import Modal from '../../../../../../components/modal/modal';
import { Policy } from '../../../../../../hooks/access-control/usePoliciesList';
import { Member } from '../../../../types/member';
import { useMembersList } from '../../../../../../hooks/members/useMembersList';
import { useRevokePolicy } from '../../../../../../hooks/access-control/useRevokePolicy';
import { MembersQueryKeys } from '../../../../../../hooks/members/constants/queryKeys';
import PaginationControls from '../../../PaginationControls/PaginationControls';

import { getModuleIcon } from './utils/getModuleIcon';
import { useGetColumns } from './hooks/useGetColumns';

import { ConfirmDeleteMember } from './components/ConfirmDeleteMember';
import { XIcon, SearchIcon, ChevronIcon, PolicyHeaderIcon } from './components/Icons';

import s from './PolicyViewDialog.module.scss';

const MEMBER_SEARCH_DEBOUNCE_MS = 300;

interface Props {
  policy: Policy | null;
  authToken: string | undefined;
  isOpen: boolean;
  onClose: () => void;
}

const MODULES_INITIAL_COUNT = 6;

export function PolicyViewDialog({ policy, authToken, isOpen, onClose }: Props) {
  const [memberSearchRaw, setMemberSearchRaw] = useState('');
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState('');
  const [showAllModules, setShowAllModules] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [dialogPagination, setDialogPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 12 });
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);

  const queryClient = useQueryClient();
  const revokePolicy = useRevokePolicy();

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
    const grouped = new Map<string, Array<{ uid: string; code: string; module: string; description: string | null }>>();
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

  const handleRemoveMember = async (member: Member) => {
    if (!policy || !authToken) {
      return;
    }

    try {
      await revokePolicy.mutateAsync({
        authToken,
        memberUid: member.uid,
        policyCode: policy.code,
      });
      toast.success(`${member.name} removed from policy`);
      queryClient.invalidateQueries({ queryKey: [MembersQueryKeys.GET_MEMBERS_LIST] });
      queryClient.invalidateQueries({ queryKey: ['POLICIES_LIST'] });
    } catch {
      toast.error('Failed to remove member from policy');
    } finally {
      setMemberToRemove(null);
    }
  };

  const columns = useGetColumns(setMemberToRemove);

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
          ) : (
            (() => {
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
            })()
          )}
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

      {memberToRemove && (
        <ConfirmDeleteMember
          member={memberToRemove}
          isLoading={revokePolicy.isLoading}
          onConfirm={() => handleRemoveMember(memberToRemove)}
          onCancel={() => setMemberToRemove(null)}
        />
      )}
    </Modal>
  );
}
