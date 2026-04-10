import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import { toast } from 'react-toastify';
import clsx from 'clsx';

import { ApprovalLayout } from '../../../layout/approval-layout';
import { useAuth } from '../../../context/auth-context';
import { useRbacPermission } from '../../../hooks/access-control/useRbacPermission';
import { useRbacRoles } from '../../../hooks/access-control/useRbacRoles';
import { useGrantPermission } from '../../../hooks/access-control/useGrantPermission';
import { useGrantRolePermission } from '../../../hooks/access-control/useGrantRolePermission';
import { useRevokePermission } from '../../../hooks/access-control/useRevokePermission';
import { useRevokeRolePermission } from '../../../hooks/access-control/useRevokeRolePermission';
import { useUpdateMemberPermissionScopes } from '../../../hooks/access-control/useUpdateMemberPermissionScopes';
import { useUpdateRolePermissionScopes } from '../../../hooks/access-control/useUpdateRolePermissionScopes';

import MemberCell from '../../../screens/access-control/components/MemberCell';
import TeamCell from '../../../screens/access-control/components/TeamCell';
import PermissionStatusCell from '../../../screens/access-control/components/PermissionStatusCell';
import AddMemberModal from '../../../screens/access-control/components/AddMemberModal';
import AddRoleModal from '../../../screens/access-control/components/AddRoleModal';
import EditScopesModal from '../../../screens/access-control/components/EditScopesModal';
import ConfirmDeleteModal from '../../../screens/access-control/components/ConfirmDeleteModal';
import InfoModal from '../../../screens/access-control/components/InfoModal';
import { MemberBasic, RoleBasic, TeamInfo } from '../../../screens/access-control/types';

import s from './styles.module.scss';

type Tab = 'roles' | 'members';
type MemberFilter = 'all' | 'direct' | 'viaRoles';

type PermissionMemberRow = MemberBasic & { viaRoles: string[]; isDirect: boolean; projectContributions: TeamInfo[]; scopes: string[] };

type PermissionRoleRow = RoleBasic & { memberCount: number; scopes: string[] };

const REMOVE_DIRECT_AND_ROLE_WARNING =
  'This member also has this permission through assigned role(s). Removing the direct grant will not remove access from those roles—the member will still have this permission until you change or remove those role assignments.';

const PermissionEditPage = () => {
  const router = useRouter();
  const { code } = router.query;
  const { isDirectoryAdmin, isLoading: authLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const [activeTab, setActiveTab] = useState<Tab>('roles');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  // Modal states
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [confirmRemoveMember, setConfirmRemoveMember] = useState<PermissionMemberRow | null>(null);
  const [removePermissionWarningNote, setRemovePermissionWarningNote] = useState<string | null>(null);
  const [infoMember, setInfoMember] = useState<PermissionMemberRow | null>(null);
  const [editScopesMember, setEditScopesMember] = useState<PermissionMemberRow | null>(null);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [confirmRemoveRole, setConfirmRemoveRole] = useState<PermissionRoleRow | null>(null);
  const [editScopesRole, setEditScopesRole] = useState<PermissionRoleRow | null>(null);

  // Fetch data
  const { data: allRolesData } = useRbacRoles({ authToken });
  const { data: permissionData, isLoading: permissionLoading } = useRbacPermission({
    authToken,
    permissionCode: code as string | undefined,
    page,
    limit,
    search: memberSearch || undefined,
    filter: memberFilter,
  });

  // Mutations
  const grantPermission = useGrantPermission();
  const grantRolePermission = useGrantRolePermission();
  const revokePermission = useRevokePermission();
  const revokeRolePermission = useRevokeRolePermission();
  const updateMemberPermissionScopes = useUpdateMemberPermissionScopes();
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

  const permission = permissionData;
  const roles = permission?.roles ?? [];
  const members = permission?.members ?? [];
  const pagination = permission?.pagination;

  const assignedRoleCodes = useMemo(
    () => new Set((permissionData?.roles ?? []).map((r) => r.code)),
    [permissionData?.roles]
  );
  const availableRolesForPermission = useMemo(() => {
    const list = allRolesData ?? [];
    return list.filter((r) => !assignedRoleCodes.has(r.code));
  }, [allRolesData, assignedRoleCodes]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMemberSearch(e.target.value);
    setPage(1); // Reset to first page on search
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setMemberFilter(e.target.value as MemberFilter);
    setPage(1); // Reset to first page on filter change
  };

  if (!authLoading && user && !isDirectoryAdmin) {
    return null;
  }

  const handleAddMember = async (member: MemberBasic, scopes: string[]) => {
    try {
      await grantPermission.mutateAsync({
        authToken,
        memberUid: member.uid,
        permissionCode: code as string,
        grantedByMemberUid: user?.uid,
        scopes,
      });
      toast.success(`Granted "${permission?.code}" to ${member.name}`);
      setShowAddMemberModal(false);
    } catch (error) {
      toast.error('Failed to grant permission');
    }
  };

  const handleRemoveMember = async () => {
    if (!confirmRemoveMember) return;
    try {
      await revokePermission.mutateAsync({
        authToken,
        memberUid: confirmRemoveMember.uid,
        permissionCode: code as string,
      });
      toast.success(`Revoked "${permission?.code}" from ${confirmRemoveMember.name}`);
      setConfirmRemoveMember(null);
      setRemovePermissionWarningNote(null);
    } catch (error) {
      toast.error('Failed to revoke permission');
    }
  };

  const handleSaveScopes = async (scopes: string[]) => {
    if (!editScopesMember) return;
    try {
      await updateMemberPermissionScopes.mutateAsync({
        authToken,
        memberUid: editScopesMember.uid,
        permissionCode: code as string,
        scopes,
      });
      toast.success(`Updated scopes for "${editScopesMember.name}"`);
      setEditScopesMember(null);
    } catch (error) {
      toast.error('Failed to update scopes');
    }
  };

  const handleAddRoleToPermission = async (role: RoleBasic, scopes: string[]) => {
    try {
      await grantRolePermission.mutateAsync({
        authToken,
        roleCode: role.code,
        permissionCode: code as string,
        scopes,
      });
      toast.success(`Granted "${permission?.code}" to role "${role.name}"`);
      setShowAddRoleModal(false);
    } catch (error) {
      toast.error('Failed to add permission to role');
    }
  };

  const handleRemoveRoleFromPermission = async () => {
    if (!confirmRemoveRole) return;
    try {
      await revokeRolePermission.mutateAsync({
        authToken,
        roleCode: confirmRemoveRole.code,
        permissionCode: code as string,
      });
      toast.success(`Removed "${permission?.code}" from role "${confirmRemoveRole.name}"`);
      setConfirmRemoveRole(null);
    } catch (error) {
      toast.error('Failed to remove permission from role');
    }
  };

  const handleSaveRoleScopes = async (scopes: string[]) => {
    if (!editScopesRole) return;
    try {
      await updateRolePermissionScopes.mutateAsync({
        authToken,
        roleCode: editScopesRole.code,
        permissionCode: code as string,
        scopes,
      });
      toast.success(`Updated scopes for role "${editScopesRole.name}"`);
      setEditScopesRole(null);
    } catch (error) {
      toast.error('Failed to update scopes');
    }
  };

  const closeRemoveMemberModal = () => {
    setConfirmRemoveMember(null);
    setRemovePermissionWarningNote(null);
  };

  /** Direct + via roles → confirm with warning. Direct only → confirm. Role-only → cannot delete info. */
  const handleDeleteClick = (member: PermissionMemberRow) => {
    if (!member.isDirect && member.viaRoles.length > 0) {
      setInfoMember(member);
      return;
    }
    if (member.isDirect && member.viaRoles.length > 0) {
      setRemovePermissionWarningNote(REMOVE_DIRECT_AND_ROLE_WARNING);
      setConfirmRemoveMember(member);
      return;
    }
    if (member.isDirect) {
      setRemovePermissionWarningNote(null);
      setConfirmRemoveMember(member);
    }
  };

  const isLoading = permissionLoading || authLoading;

  return (
    <ApprovalLayout>
      <div className={s.root}>
        {/* Back button */}
        <button onClick={() => router.push('/access-control?tab=permissions')} className={s.backButton}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Permissions
        </button>

        {/* Permission header */}
        <div className={s.permissionHeader}>
          {isLoading || !permission ? (
            <div className={s.loading}>Loading...</div>
          ) : (
            <>
              <div className={s.permissionInfo}>
                <h1 className={s.permissionCode}>{permission.code}</h1>
                <p className={s.permissionDescription}>{permission.description || 'No description'}</p>
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className={s.tabs}>
          <button className={clsx(s.tab, { [s.active]: activeTab === 'roles' })} onClick={() => setActiveTab('roles')}>
            Roles ({roles.length})
          </button>
          <button
            className={clsx(s.tab, { [s.active]: activeTab === 'members' })}
            onClick={() => setActiveTab('members')}
          >
            Members ({pagination?.total ?? members.length})
          </button>
        </div>

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <div className={s.tabContent}>
            <div className={s.sectionHeader}>
              <h3 className={s.sectionTitle}>Roles with this permission</h3>
              <button onClick={() => setShowAddRoleModal(true)} className={s.addButton}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add role
              </button>
            </div>

            <div className={s.table}>
              <div className={s.tableHeader}>
                <div className={s.tableRow}>
                  <div className={clsx(s.headerCell, s.roleName)}>Role</div>
                  <div className={clsx(s.headerCell, s.flexible)}>Description</div>
                  <div className={clsx(s.headerCell, s.memberCount)}>Members</div>
                  <div className={clsx(s.headerCell, s.rolesScopesCol)}>Scopes</div>
                  <div className={clsx(s.headerCell, s.rolesActionCell)}>Action</div>
                </div>
              </div>
              <div className={s.tableBody}>
                {roles.length === 0 ? (
                  <div className={s.emptyState}>No roles have this permission.</div>
                ) : (
                  roles.map((role) => (
                    <div key={role.code} className={s.tableRow}>
                      <div className={clsx(s.bodyCell, s.roleName)}>
                        <span className={s.roleNameText}>{role.name}</span>
                      </div>
                      <div className={clsx(s.bodyCell, s.flexible)}>{role.description || '-'}</div>
                      <div className={clsx(s.bodyCell, s.memberCount)}>
                        <span className={s.countText}>{role.memberCount}</span>
                      </div>
                      <div className={clsx(s.bodyCell, s.rolesScopesCol)}>
                        <div className={s.scopesCell}>
                          {role.scopes?.length > 0 ? (
                            role.scopes.map((scope) => (
                              <span key={scope} className={s.scopeTag}>{scope}</span>
                            ))
                          ) : (
                            <span className={s.scopeEmpty}>--</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditScopesRole(role)}
                            className={s.scopeEditButton}
                            title="Edit scopes"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div className={clsx(s.bodyCell, s.rolesActionCell)}>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveRole(role)}
                          className={s.deleteButton}
                          disabled={revokeRolePermission.isPending}
                          title="Remove this permission from role"
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
            </div>
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className={s.tabContent}>
            <div className={s.sectionHeader}>
              <h3 className={s.sectionTitle}>Members with this permission ({pagination?.total ?? members.length})</h3>
              <button onClick={() => setShowAddMemberModal(true)} className={s.addButton}>
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Direct Permission
              </button>
            </div>

            <div className={s.filterBar}>
              <input
                type="text"
                value={memberSearch}
                onChange={handleSearchChange}
                placeholder="Search members by name or email..."
                className={s.searchInput}
              />
              <select value={memberFilter} onChange={handleFilterChange} className={s.filterSelect}>
                <option value="all">All</option>
                <option value="direct">Direct Only</option>
                <option value="viaRoles">Via Roles Only</option>
              </select>
            </div>

            <div className={s.table}>
              <div className={s.tableHeader}>
                <div className={s.tableRow}>
                  <div className={clsx(s.headerCell, s.memberCell)}>Member</div>
                  <div className={clsx(s.headerCell, s.teamCell)}>Team</div>
                  <div className={clsx(s.headerCell, s.viaRolesCell)}>Via Roles</div>
                  <div className={clsx(s.headerCell, s.directCell)}>Direct</div>
                  <div className={clsx(s.headerCell, s.scopesCol)}>Scopes</div>
                  <div className={clsx(s.headerCell, s.actionCell)}>Action</div>
                </div>
              </div>
              <div className={s.tableBody}>
                {members.length === 0 ? (
                  <div className={s.emptyState}>
                    {memberSearch || memberFilter !== 'all'
                      ? 'No members found matching your filters.'
                      : 'No members have this permission yet.'}
                  </div>
                ) : (
                  members.map((member) => (
                    <div key={member.uid} className={s.tableRow}>
                      <div className={clsx(s.bodyCell, s.memberCell)}>
                        <MemberCell member={member} />
                      </div>
                      <div className={clsx(s.bodyCell, s.teamCell)}>
                        <TeamCell projectContributions={member.projectContributions ?? []} />
                      </div>
                      <div className={clsx(s.bodyCell, s.viaRolesCell)}>
                        <PermissionStatusCell viaRoles={member.viaRoles} isDirect={member.isDirect} variant="tags" />
                      </div>
                      <div className={clsx(s.bodyCell, s.directCell)}>
                        <PermissionStatusCell viaRoles={member.viaRoles} isDirect={member.isDirect} variant="badges" />
                      </div>
                      <div className={clsx(s.bodyCell, s.scopesCol)}>
                        <div className={s.scopesCell}>
                          {member.scopes?.length > 0 ? (
                            member.scopes.map((scope) => (
                              <span key={scope} className={s.scopeTag}>{scope}</span>
                            ))
                          ) : (
                            <span className={s.scopeEmpty}>--</span>
                          )}
                          {member.isDirect && (
                            <button
                              type="button"
                              onClick={() => setEditScopesMember(member)}
                              className={s.scopeEditButton}
                              title="Edit scopes"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                      <div className={clsx(s.bodyCell, s.actionCell)}>
                        {member.isDirect ? (
                          <button
                            onClick={() => handleDeleteClick(member)}
                            className={s.deleteButton}
                            disabled={revokePermission.isPending}
                            title="Remove direct permission"
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
                        ) : member.viaRoles.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setInfoMember(member)}
                            className={s.deleteButtonMuted}
                            title="Granted only through roles — remove the role or adjust assignments to change access"
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
                        ) : null}
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

        {/* Add Member Modal */}
        <AddMemberModal
          isOpen={showAddMemberModal}
          onClose={() => setShowAddMemberModal(false)}
          onAdd={handleAddMember}
          title={`Grant "${permission?.code}" to Member`}
          existingMemberUids={members.filter((m) => m.isDirect).map((m) => m.uid)}
          isLoading={grantPermission.isPending}
          showScopes
        />

        {/* Confirm Remove Member Modal */}
        {confirmRemoveMember && (
          <ConfirmDeleteModal
            isOpen={!!confirmRemoveMember}
            onClose={closeRemoveMemberModal}
            onConfirm={handleRemoveMember}
            title="Remove Direct Permission"
            message={`Are you sure you want to revoke "${permission?.code}" from "${confirmRemoveMember.name}"?`}
            warningNote={removePermissionWarningNote}
            isLoading={revokePermission.isPending}
          />
        )}

        {/* Info Modal for inherited permissions */}
        {infoMember && (
          <InfoModal
            isOpen={!!infoMember}
            onClose={() => setInfoMember(null)}
            title="Cannot Remove Permission"
            message={`This member has this permission via the following role(s):`}
            items={infoMember.viaRoles}
          />
        )}

        {/* Edit Scopes Modal */}
        {editScopesMember && (
          <EditScopesModal
            isOpen={!!editScopesMember}
            onClose={() => setEditScopesMember(null)}
            onSave={handleSaveScopes}
            title={`Edit Scopes for ${editScopesMember.name}`}
            currentScopes={editScopesMember.scopes ?? []}
            isLoading={updateMemberPermissionScopes.isPending}
          />
        )}

        <AddRoleModal
          isOpen={showAddRoleModal}
          onClose={() => setShowAddRoleModal(false)}
          onAdd={handleAddRoleToPermission}
          title={`Grant "${permission?.code ?? ''}" to a role`}
          roles={availableRolesForPermission}
          isLoading={grantRolePermission.isPending}
          showScopes
        />

        {confirmRemoveRole && (
          <ConfirmDeleteModal
            isOpen={!!confirmRemoveRole}
            onClose={() => setConfirmRemoveRole(null)}
            onConfirm={handleRemoveRoleFromPermission}
            title="Remove permission from role"
            message={`Remove "${permission?.code}" from role "${confirmRemoveRole.name}"? Members with only this role will lose this permission unless they have it another way.`}
            isLoading={revokeRolePermission.isPending}
          />
        )}

        {editScopesRole && (
          <EditScopesModal
            isOpen={!!editScopesRole}
            onClose={() => setEditScopesRole(null)}
            onSave={handleSaveRoleScopes}
            title={`Edit scopes for role ${editScopesRole.name}`}
            currentScopes={editScopesRole.scopes ?? []}
            isLoading={updateRolePermissionScopes.isPending}
          />
        )}
      </div>
    </ApprovalLayout>
  );
};

export default PermissionEditPage;
