import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import { toast } from 'react-toastify';
import clsx from 'clsx';

import { ApprovalLayout } from '../../../layout/approval-layout';
import { useAuth } from '../../../context/auth-context';
import { useRbacRole } from '../../../hooks/access-control/useRbacRole';
import { useAssignRole } from '../../../hooks/access-control/useAssignRole';
import { useRevokeRole } from '../../../hooks/access-control/useRevokeRole';
import { useUpdateRolePermissionScopes } from '../../../hooks/access-control/useUpdateRolePermissionScopes';

import MemberCell from '../../../screens/access-control/components/MemberCell';
import TeamCell from '../../../screens/access-control/components/TeamCell';
import AddMemberModal from '../../../screens/access-control/components/AddMemberModal';
import ConfirmDeleteModal from '../../../screens/access-control/components/ConfirmDeleteModal';
import EditScopesModal from '../../../screens/access-control/components/EditScopesModal';
import { MemberBasic, PermissionBasic } from '../../../screens/access-control/types';

import s from './styles.module.scss';

type Tab = 'members' | 'permissions';

const RoleEditPage = () => {
  const router = useRouter();
  const { code } = router.query;
  const { isDirectoryAdmin, isLoading: authLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const [activeTab, setActiveTab] = useState<Tab>('members');
  const [memberSearch, setMemberSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Modal states
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<MemberBasic | null>(null);
  const [editScopesPerm, setEditScopesPerm] = useState<PermissionBasic | null>(null);

  // Fetch data
  const { data: roleData, isLoading: roleLoading } = useRbacRole({
    authToken,
    roleCode: code as string | undefined,
    page,
    limit,
    search: memberSearch || undefined,
  });

  // Mutations
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();
  const updateRolePermissionScopes = useUpdateRolePermissionScopes();

  // Redirects
  useEffect(() => {
    if (!authToken) {
      router.push(`/?backlink=${router.asPath}`);
    }
  }, [authToken, router]);

  useEffect(() => {
    if (!authLoading && user && !isDirectoryAdmin) {
      router.replace('/demo-days');
    }
  }, [authLoading, user, isDirectoryAdmin, router]);

  const members = useMemo(() => roleData?.members ?? [], [roleData]);
  const permissions = useMemo(() => roleData?.permissions ?? [], [roleData]);
  const pagination = roleData?.pagination;

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMemberSearch(e.target.value);
    setPage(1); // Reset to first page on search
  };

  const handleAddMember = async (member: MemberBasic, _scopes: string[]) => {
    try {
      await assignRole.mutateAsync({
        authToken,
        memberUid: member.uid,
        roleCode: code as string,
        assignedByMemberUid: user?.uid,
      });
      toast.success(`Added ${member.name} to role "${roleData?.name}"`);
      setShowAddMemberModal(false);
    } catch (error) {
      toast.error('Failed to add member to role');
    }
  };

  const handleRemoveMember = async () => {
    if (!confirmRemoveMember) return;
    try {
      await revokeRole.mutateAsync({
        authToken,
        memberUid: confirmRemoveMember.uid,
        roleCode: code as string,
      });
      toast.success(`Removed ${confirmRemoveMember.name} from role "${roleData?.name}"`);
      setConfirmRemoveMember(null);
    } catch (error) {
      toast.error('Failed to remove member from role');
    }
  };

  const handleSaveRoleScopes = async (scopes: string[]) => {
    if (!editScopesPerm) return;
    try {
      await updateRolePermissionScopes.mutateAsync({
        authToken,
        roleCode: code as string,
        permissionCode: editScopesPerm.code,
        scopes,
      });
      toast.success(`Updated scopes for "${editScopesPerm.code}"`);
      setEditScopesPerm(null);
    } catch (error) {
      toast.error('Failed to update scopes');
    }
  };

  const isLoading = roleLoading || authLoading;

  if (!authLoading && user && !isDirectoryAdmin) {
    return null;
  }

  return (
    <ApprovalLayout>
      <div className={s.root}>
        {/* Back button */}
        <button onClick={() => router.push('/access-control?tab=roles')} className={s.backButton}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Roles
        </button>

        {/* Role header */}
        <div className={s.roleHeader}>
          {isLoading || !roleData ? (
            <div className={s.loading}>Loading...</div>
          ) : (
            <>
              <div className={s.roleInfo}>
                <h1 className={s.roleName}>{roleData.name}</h1>
                <p className={s.roleCode}>{roleData.code}</p>
                <p className={s.roleDescription}>{roleData.description || 'No description'}</p>
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className={s.tabs}>
          <button
            className={clsx(s.tab, { [s.active]: activeTab === 'members' })}
            onClick={() => setActiveTab('members')}
          >
            Role Members ({pagination?.total ?? members.length})
          </button>
          <button
            className={clsx(s.tab, { [s.active]: activeTab === 'permissions' })}
            onClick={() => setActiveTab('permissions')}
          >
            Role Permissions ({permissions.length})
          </button>
        </div>

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className={s.tabContent}>
            <div className={s.sectionHeader}>
              <h3 className={s.sectionTitle}>Members with this role ({pagination?.total ?? members.length})</h3>
              <button onClick={() => setShowAddMemberModal(true)} className={s.addButton}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Member
              </button>
            </div>

            <div className={s.searchBar}>
              <input
                type="text"
                value={memberSearch}
                onChange={handleSearchChange}
                placeholder="Search members by name or email..."
                className={s.searchInput}
              />
            </div>

            <div className={s.table}>
              <div className={s.tableHeader}>
                <div className={s.tableRow}>
                  <div className={clsx(s.headerCell, s.memberColumn)}>Member</div>
                  <div className={clsx(s.headerCell, s.flexible)}>Team</div>
                  <div className={clsx(s.headerCell, s.fixed)}>Action</div>
                </div>
              </div>
              <div className={s.tableBody}>
                {members.length === 0 ? (
                  <div className={s.emptyState}>
                    {memberSearch ? 'No members found matching your search.' : 'No members have this role yet.'}
                  </div>
                ) : (
                  members.map((member) => (
                    <div key={member.uid} className={s.tableRow}>
                      <div className={clsx(s.bodyCell, s.memberColumn)}>
                        <MemberCell member={member} />
                      </div>
                      <div className={clsx(s.bodyCell, s.flexible)}>
                        <TeamCell teamMemberRoles={member.teamMemberRoles ?? []} />
                      </div>
                      <div className={clsx(s.bodyCell, s.fixed)}>
                        <button
                          onClick={() => setConfirmRemoveMember(member)}
                          className={s.removeButton}
                          disabled={revokeRole.isPending}
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className={s.pagination}>
                  <div className={s.paginationLeft}>
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className={s.paginationBtn}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Previous
                    </button>

                    {/* Page numbers */}
                    {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={clsx(s.pageBtn, { [s.active]: page === p })}
                      >
                        {p}
                      </button>
                    ))}

                    <button
                      onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                      disabled={page === pagination.totalPages}
                      className={s.paginationBtn}
                    >
                      Next
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  <div className={s.paginationInputWrapper}>
                    Go to
                    <input
                      type="number"
                      min={1}
                      max={pagination.totalPages}
                      value={page}
                      onChange={(e) => {
                        const newPage = parseInt(e.target.value, 10);
                        if (newPage >= 1 && newPage <= pagination.totalPages) {
                          setPage(newPage);
                        }
                      }}
                      className={s.paginationInput}
                    />
                    of {pagination.totalPages}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Permissions Tab */}
        {activeTab === 'permissions' && (
          <div className={s.tabContent}>
            <div className={s.sectionHeader}>
              <h3 className={s.sectionTitle}>Permissions granted by this role</h3>
            </div>

            <div className={s.table}>
              <div className={s.tableHeader}>
                <div className={s.tableRow}>
                  <div className={clsx(s.headerCell, s.permissionCode)}>Permission</div>
                  <div className={clsx(s.headerCell, s.flexible)}>Description</div>
                  <div className={clsx(s.headerCell, s.fixed)}>Scopes</div>
                </div>
              </div>
              <div className={s.tableBody}>
                {permissions.length === 0 ? (
                  <div className={s.emptyState}>This role has no permissions.</div>
                ) : (
                  permissions.map((permission) => (
                    <div key={permission.code} className={s.tableRow}>
                      <div className={clsx(s.bodyCell, s.permissionCode)}>
                        <span className={s.codeText}>{permission.code}</span>
                      </div>
                      <div className={clsx(s.bodyCell, s.flexible)}>{permission.description || '-'}</div>
                      <div className={clsx(s.bodyCell, s.fixed)}>
                        <div className={s.scopesCell}>
                          {permission.scopes?.length ? (
                            permission.scopes.map((scope) => (
                              <span key={scope} className={s.scopeTag}>{scope}</span>
                            ))
                          ) : (
                            <span className={s.scopeEmpty}>--</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditScopesPerm(permission)}
                            className={s.scopeEditButton}
                            title="Edit scopes"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add Member Modal */}
        <AddMemberModal
          isOpen={showAddMemberModal}
          onClose={() => setShowAddMemberModal(false)}
          onAdd={handleAddMember}
          title={`Add Member to "${roleData?.name}"`}
          excludeRoleCode={code as string}
          isLoading={assignRole.isPending}
        />

        {/* Confirm Remove Member Modal */}
        {confirmRemoveMember && (
          <ConfirmDeleteModal
            isOpen={!!confirmRemoveMember}
            onClose={() => setConfirmRemoveMember(null)}
            onConfirm={handleRemoveMember}
            title="Remove Member from Role"
            message={`Are you sure you want to remove "${confirmRemoveMember.name}" from the role "${roleData?.name}"?`}
            isLoading={revokeRole.isPending}
          />
        )}

        {/* Edit Scopes Modal */}
        {editScopesPerm && (
          <EditScopesModal
            isOpen={!!editScopesPerm}
            onClose={() => setEditScopesPerm(null)}
            onSave={handleSaveRoleScopes}
            title={`Edit Scopes for ${editScopesPerm.code}`}
            currentScopes={editScopesPerm.scopes ?? []}
            isLoading={updateRolePermissionScopes.isPending}
          />
        )}
      </div>
    </ApprovalLayout>
  );
};

export default RoleEditPage;
