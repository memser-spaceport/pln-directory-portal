import React, { useCallback, useEffect, useMemo, useState } from 'react';

import s from '../members/styles.module.scss';
import { ApprovalLayout } from '../../layout/approval-layout';
import { useRouter } from 'next/router';
import { flexRender, PaginationState, SortingState } from '@tanstack/react-table';
import clsx from 'clsx';
import { useCookie } from 'react-use';
import { toast } from 'react-toastify';

import { useMembersList } from '../../hooks/members/useMembersList';
import PaginationControls from '../../screens/members/components/PaginationControls/PaginationControls';
import { SortIcon } from '../../screens/members/components/icons';
import { useRolesTable } from '../../screens/roles/hooks/useRolesTable';
import { useAuth } from '../../context/auth-context';
import { MemberRole } from '../../utils/constants';
import { DEMO_DAY_HOSTS } from '@protocol-labs-network/contracts/constants';
import { PendingRoleChange, PendingHostChange } from '../../screens/members/components/RoleCell/RoleCell';
import { useUpdateMemberRolesAndHosts } from '../../hooks/members/useUpdateMemberRolesAndHosts';
import { RolesSaveControls } from '../../screens/roles/components/RolesSaveControls';

const ALL_ACCESS_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'Rejected'];

type RoleFilterValue = '' | MemberRole.DIRECTORY_ADMIN | MemberRole.DEMO_DAY_ADMIN;

const RolesPage = () => {
  const router = useRouter();
  const { isDirectoryAdmin, isLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');
  const { mutateAsync: updateMemberRolesAndHosts } = useUpdateMemberRolesAndHosts();

  const [sorting, setSorting] = useState<SortingState>([
    {
      id: 'name',
      desc: false,
    },
  ]);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const [globalFilter, setGlobalFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<RoleFilterValue>('');
  const [scopeFilter, setScopeFilter] = useState<string>('');
  const [pendingRoleChanges, setPendingRoleChanges] = useState<Map<string, PendingRoleChange>>(new Map());
  const [pendingHostChanges, setPendingHostChanges] = useState<Map<string, PendingHostChange>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  const { data } = useMembersList({
    authToken,
    accessLevel: ALL_ACCESS_LEVELS,
  });

  // Reset scope filter when role filter changes away from Demo Day Admin
  useEffect(() => {
    if (roleFilter !== MemberRole.DEMO_DAY_ADMIN) {
      setScopeFilter('');
    }
  }, [roleFilter]);

  // Filter members by role and scope before passing to the table
  const filteredMembers = useMemo(() => {
    if (!data?.data) return [];

    let result = data.data;

    // Filter by role
    if (roleFilter) {
      result = result.filter((member) => {
        const roles = member.roles || [];
        const memberRoleNames = member.memberRoles?.map((r) => r.name) || [];
        const allRoles = [...roles, ...memberRoleNames];
        return allRoles.includes(roleFilter);
      });
    }

    // Filter by Demo Day scope (only when Demo Day Admin role is selected)
    if (scopeFilter && roleFilter === MemberRole.DEMO_DAY_ADMIN) {
      result = result.filter((member) => {
        // Check demoDayHosts array
        const demoDayHosts = member.demoDayHosts || [];
        if (demoDayHosts.some((h) => h.toLowerCase() === scopeFilter.toLowerCase())) {
          return true;
        }

        // Check demoDayAdminScopes
        const scopes = member.demoDayAdminScopes || [];
        return scopes.some((s) => s.scopeType === 'HOST' && s.scopeValue.toLowerCase() === scopeFilter.toLowerCase());
      });
    }

    return result;
  }, [data?.data, roleFilter, scopeFilter]);

  const handleRoleChange = useCallback((change: PendingRoleChange | null, memberUid: string) => {
    setPendingRoleChanges((prev) => {
      const next = new Map(prev);
      if (change) {
        next.set(memberUid, change);
      } else {
        next.delete(memberUid);
      }
      return next;
    });
  }, []);

  const handleHostChange = useCallback((change: PendingHostChange | null, memberUid: string) => {
    setPendingHostChanges((prev) => {
      const next = new Map(prev);
      if (change) {
        next.set(memberUid, change);
      } else {
        next.delete(memberUid);
      }
      return next;
    });
  }, []);

  const hasPendingChanges = pendingRoleChanges.size > 0 || pendingHostChanges.size > 0;

  const memberCountWithPendingChanges = useMemo(() => {
    const memberUids = new Set<string>();
    pendingRoleChanges.forEach((_, uid) => memberUids.add(uid));
    pendingHostChanges.forEach((_, uid) => memberUids.add(uid));
    return memberUids.size;
  }, [pendingRoleChanges, pendingHostChanges]);

  const handleSave = useCallback(async () => {
    if (!authToken) {
      toast.error('Missing admin token');
      return;
    }

    if (!hasPendingChanges) {
      return;
    }

    setIsSaving(true);

    const currentRoleChanges = Array.from(pendingRoleChanges.values());
    const currentHostChanges = Array.from(pendingHostChanges.values());

    // Group changes by member UID
    const memberUids = new Set<string>();
    currentRoleChanges.forEach((change) => memberUids.add(change.memberUid));
    currentHostChanges.forEach((change) => memberUids.add(change.memberUid));

    const roleChangesMap = new Map<string, string[]>();
    currentRoleChanges.forEach((change) => {
      roleChangesMap.set(change.memberUid, change.roles);
    });

    const hostChangesMap = new Map<string, string[]>();
    currentHostChanges.forEach((change) => {
      hostChangesMap.set(change.memberUid, change.hosts);
    });

    try {
      const promises = Array.from(memberUids).map((memberUid) =>
        updateMemberRolesAndHosts({
          authToken,
          memberUid,
          roles: roleChangesMap.get(memberUid),
          hosts: hostChangesMap.get(memberUid),
        })
      );

      await Promise.all(promises);

      setPendingRoleChanges(new Map());
      setPendingHostChanges(new Map());

      const totalChanges = memberUids.size;
      toast.success(`Successfully saved ${totalChanges} change${totalChanges !== 1 ? 's' : ''}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [authToken, hasPendingChanges, pendingRoleChanges, pendingHostChanges, updateMemberRolesAndHosts]);

  const { table } = useRolesTable({
    members: filteredMembers,
    sorting,
    setSorting,
    pagination,
    setPagination,
    globalFilter,
    setGlobalFilter,
    onRoleChange: handleRoleChange,
    onHostChange: handleHostChange,
    authToken,
  });

  useEffect(() => {
    if (!isLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [isLoading, user, isDirectoryAdmin, router]);

  const handleReset = useCallback(() => {
    setPendingRoleChanges(new Map());
    setPendingHostChanges(new Map());
  }, []);

  if (!isLoading && user && !isDirectoryAdmin) {
    return null;
  }

  return (
    <ApprovalLayout>
      <div className={s.root}>
        <div className={s.header}>
          <span className={s.title}>Roles</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={s.filters}>
              <input
                value={globalFilter}
                onChange={(e) => table.setGlobalFilter(String(e.target.value))}
                placeholder="Search by name or email"
                className={clsx(s.input)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    table.setGlobalFilter('');
                  }
                }}
              />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as RoleFilterValue)}
                className={clsx(s.input)}
                style={{ marginLeft: 8, minWidth: 160 }}
              >
                <option value="">All roles</option>
                <option value={MemberRole.DIRECTORY_ADMIN}>Directory Admin</option>
                <option value={MemberRole.DEMO_DAY_ADMIN}>Demo Day Admin</option>
              </select>
              {roleFilter === MemberRole.DEMO_DAY_ADMIN && (
                <select
                  value={scopeFilter}
                  onChange={(e) => setScopeFilter(e.target.value)}
                  className={clsx(s.input)}
                  style={{ marginLeft: 8, minWidth: 160 }}
                >
                  <option value="">All hosts</option>
                  {DEMO_DAY_HOSTS.map((host) => (
                    <option key={host} value={host}>
                      {host}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </div>
        </div>

        <div className={s.body}>
          <div className={s.table}>
            {/* Header */}
            {table.getHeaderGroups().map((headerGroup) => (
              <div key={headerGroup.id} className={s.tableRow}>
                {headerGroup.headers.map((header, i) => {
                  if (header.isPlaceholder) return null;

                  return (
                    <div
                      key={header.id}
                      className={clsx(s.headerCell, {
                        [s.first]: i === 0,
                        [s.last]: i === headerGroup.headers.length - 1,
                        [s.sortable]: header.column.getCanSort(),
                        [s.fixed]: !!header.column.columnDef.size,
                        [s.flexible]: !header.column.columnDef.size,
                      })}
                      style={{
                        width: header.column.getSize(),
                        flexBasis: header.column.getSize(),
                      }}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className={s.headerCellInner}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && <SortIcon />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Body */}
            {table.getRowModel().rows.map((row) => (
              <React.Fragment key={row.id}>
                <div className={s.tableRow}>
                  {row.getVisibleCells().map((cell, i) => (
                    <div
                      key={cell.id}
                      className={clsx(s.bodyCell, {
                        [s.first]: i === 0,
                        [s.last]: i === row.getVisibleCells().length - 1,
                        [s.fixed]: !!cell.column.columnDef.size,
                        [s.flexible]: !cell.column.columnDef.size,
                      })}
                      style={{
                        width: cell.column.getSize(),
                        flexBasis: cell.column.getSize(),
                      }}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </div>
                  ))}
                </div>
              </React.Fragment>
            ))}
          </div>
          <RolesSaveControls
            memberCount={memberCountWithPendingChanges}
            onReset={handleReset}
            onSave={handleSave}
            isSaving={isSaving}
          />
        </div>

        <div className={s.footer}>
          <PaginationControls table={table} />
        </div>
      </div>
    </ApprovalLayout>
  );
};

export default RolesPage;
