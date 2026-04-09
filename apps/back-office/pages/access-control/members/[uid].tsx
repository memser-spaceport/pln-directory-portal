import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useCookie } from 'react-use';
import { toast } from 'react-toastify';
import clsx from 'clsx';

import { ApprovalLayout } from '../../../layout/approval-layout';

// Chevron icons as inline SVG components
const ChevronDownIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
  </svg>
);
import { useAuth } from '../../../context/auth-context';
import { useRbacMember } from '../../../hooks/access-control/useRbacMember';
import { useRbacRoles } from '../../../hooks/access-control/useRbacRoles';
import { useRbacPermissions } from '../../../hooks/access-control/useRbacPermissions';
import { useAssignRole } from '../../../hooks/access-control/useAssignRole';
import { useRevokeRole } from '../../../hooks/access-control/useRevokeRole';
import { useGrantPermission } from '../../../hooks/access-control/useGrantPermission';
import { useRevokePermission } from '../../../hooks/access-control/useRevokePermission';

import MemberCell from '../../../screens/access-control/components/MemberCell';
import TeamCell from '../../../screens/access-control/components/TeamCell';
import PermissionStatusCell from '../../../screens/access-control/components/PermissionStatusCell';
import AddRoleModal from '../../../screens/access-control/components/AddRoleModal';
import AddPermissionModal from '../../../screens/access-control/components/AddPermissionModal';
import ConfirmDeleteModal from '../../../screens/access-control/components/ConfirmDeleteModal';
import InfoModal from '../../../screens/access-control/components/InfoModal';
import EditScopesModal from '../../../screens/access-control/components/EditScopesModal';
import { RoleBasic, PermissionBasic } from '../../../screens/access-control/types';
import { useUpdateMemberPermissionScopes } from '../../../hooks/access-control/useUpdateMemberPermissionScopes';

import s from './styles.module.scss';

type Tab = 'roles' | 'permissions';
type PermissionFilter = 'all' | 'direct' | 'viaRoles';

type MemberPermissionRow = PermissionBasic & { viaRoles: string[]; isDirect: boolean; scopes: string[] };

const REMOVE_DIRECT_AND_ROLE_WARNING =
  'This permission is also granted through assigned role(s). Removing the direct grant will not remove access from those roles—you can still have this permission until you change or remove those role assignments.';

const MemberEditPage = () => {
  const router = useRouter();
  const { uid } = router.query;
  const { isDirectoryAdmin, isLoading: authLoading, user } = useAuth();
  const [authToken] = useCookie('plnadmin');

  const [activeTab, setActiveTab] = useState<Tab>('roles');
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set());
  const [permissionFilter, setPermissionFilter] = useState<PermissionFilter>('all');

  // Modal states
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [showAddPermissionModal, setShowAddPermissionModal] = useState(false);
  const [confirmRemoveRole, setConfirmRemoveRole] = useState<RoleBasic | null>(null);
  const [confirmRemovePermission, setConfirmRemovePermission] = useState<PermissionBasic | null>(null);
  const [removePermissionWarningNote, setRemovePermissionWarningNote] = useState<string | null>(null);
  const [infoPermission, setInfoPermission] = useState<(PermissionBasic & { viaRoles: string[] }) | null>(null);
  const [editScopesPerm, setEditScopesPerm] = useState<MemberPermissionRow | null>(null);

  // Fetch data
  const { data: memberData, isLoading: memberLoading } = useRbacMember({
    authToken,
    memberUid: uid as string | undefined,
  });

  const { data: allRoles } = useRbacRoles({ authToken });
  const { data: allPermissionsCatalog } = useRbacPermissions({ authToken });

  // Mutations
  const assignRole = useAssignRole();
  const revokeRole = useRevokeRole();
  const grantPermission = useGrantPermission();
  const revokePermission = useRevokePermission();
  const updateMemberPermissionScopes = useUpdateMemberPermissionScopes();

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

  const member = memberData?.member;
  const memberRoles = memberData?.roles ?? [];
  const allPermissions = memberData?.allPermissions ?? [];

  const availableRoles = useMemo(() => {
    const assignedCodes = new Set(memberRoles.map((r) => r.code));
    return (allRoles ?? []).filter((r) => !assignedCodes.has(r.code));
  }, [allRoles, memberRoles]);

  const availablePermissionsToGrant = useMemo(() => {
    const directCodes = new Set((memberData?.directPermissions ?? []).map((p) => p.code));
    return (allPermissionsCatalog ?? []).filter((p) => !directCodes.has(p.code));
  }, [allPermissionsCatalog, memberData?.directPermissions]);

  const filteredPermissions = useMemo(() => {
    if (permissionFilter === 'all') return allPermissions;
    if (permissionFilter === 'direct') return allPermissions.filter((p) => p.isDirect);
    if (permissionFilter === 'viaRoles') return allPermissions.filter((p) => p.viaRoles.length > 0);
    return allPermissions;
  }, [allPermissions, permissionFilter]);

  const toggleRoleExpanded = (roleCode: string) => {
    setExpandedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleCode)) {
        next.delete(roleCode);
      } else {
        next.add(roleCode);
      }
      return next;
    });
  };

  const handleAddRole = async (role: RoleBasic) => {
    try {
      await assignRole.mutateAsync({
        authToken,
        memberUid: uid as string,
        roleCode: role.code,
        assignedByMemberUid: user?.uid,
      });
      toast.success(`Added role "${role.name}" to ${member?.name}`);
      setShowAddRoleModal(false);
    } catch (error) {
      toast.error('Failed to assign role');
    }
  };

  const handleRemoveRole = async () => {
    if (!confirmRemoveRole) return;
    try {
      await revokeRole.mutateAsync({
        authToken,
        memberUid: uid as string,
        roleCode: confirmRemoveRole.code,
      });
      toast.success(`Removed role "${confirmRemoveRole.name}" from ${member?.name}`);
      setConfirmRemoveRole(null);
    } catch (error) {
      toast.error('Failed to revoke role');
    }
  };

  const handleAddPermission = async (permission: PermissionBasic, scopes: string[]) => {
    try {
      await grantPermission.mutateAsync({
        authToken,
        memberUid: uid as string,
        permissionCode: permission.code,
        grantedByMemberUid: user?.uid,
        scopes,
      });
      toast.success(`Granted permission "${permission.code}" to ${member?.name}`);
      setShowAddPermissionModal(false);
    } catch (error) {
      toast.error('Failed to grant permission');
    }
  };

  const handleRemovePermission = async () => {
    if (!confirmRemovePermission) return;
    try {
      await revokePermission.mutateAsync({
        authToken,
        memberUid: uid as string,
        permissionCode: confirmRemovePermission.code,
      });
      toast.success(`Revoked permission "${confirmRemovePermission.code}" from ${member?.name}`);
      setConfirmRemovePermission(null);
      setRemovePermissionWarningNote(null);
    } catch (error) {
      toast.error('Failed to revoke permission');
    }
  };

  const closeRemovePermissionModal = () => {
    setConfirmRemovePermission(null);
    setRemovePermissionWarningNote(null);
  };

  const handleSaveScopes = async (scopes: string[]) => {
    if (!editScopesPerm) return;
    try {
      await updateMemberPermissionScopes.mutateAsync({
        authToken,
        memberUid: uid as string,
        permissionCode: editScopesPerm.code,
        scopes,
      });
      toast.success(`Updated scopes for "${editScopesPerm.code}"`);
      setEditScopesPerm(null);
    } catch (error) {
      toast.error('Failed to update scopes');
    }
  };

  /** Direct + via roles → confirm with warning. Direct only → confirm. Role-only → cannot delete info. */
  const handlePermissionActionClick = (perm: MemberPermissionRow) => {
    if (!perm.isDirect && perm.viaRoles.length > 0) {
      setInfoPermission(perm);
      return;
    }
    if (perm.isDirect && perm.viaRoles.length > 0) {
      setRemovePermissionWarningNote(REMOVE_DIRECT_AND_ROLE_WARNING);
      setConfirmRemovePermission(perm);
      return;
    }
    if (perm.isDirect) {
      setRemovePermissionWarningNote(null);
      setConfirmRemovePermission(perm);
    }
  };

  const isLoading = memberLoading || authLoading;

  if (!authLoading && user && !isDirectoryAdmin) {
    return null;
  }

  return (
    <ApprovalLayout>
      <div className={s.root}>
        {/* Back button */}
        <button onClick={() => router.push('/access-control?tab=members')} className={s.backButton}>
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Members
        </button>

        {/* Member header */}
        <div className={s.memberHeader}>
          {isLoading || !member ? (
            <div className={s.loading}>Loading...</div>
          ) : (
            <>
              <MemberCell member={member} linkNameToDirectory />
              <div className={s.memberMeta}>
                <TeamCell projectContributions={member.projectContributions} />
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className={s.tabs}>
          <button className={clsx(s.tab, { [s.active]: activeTab === 'roles' })} onClick={() => setActiveTab('roles')}>
            Roles ({memberRoles.length})
          </button>
          <button
            className={clsx(s.tab, { [s.active]: activeTab === 'permissions' })}
            onClick={() => setActiveTab('permissions')}
          >
            Permissions ({allPermissions.length})
          </button>
        </div>

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <div className={s.tabContent}>
            <div className={s.sectionHeader}>
              <h3 className={s.sectionTitle}>Assigned Roles</h3>
              <button
                onClick={() => setShowAddRoleModal(true)}
                className={s.addButton}
                disabled={availableRoles.length === 0}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Role
              </button>
            </div>

            {memberRoles.length === 0 ? (
              <div className={s.emptyState}>No roles assigned yet.</div>
            ) : (
              <div className={s.rolesList}>
                {memberRoles.map((role) => (
                  <div key={role.code} className={s.roleCard}>
                    <div className={s.roleHeader}>
                      <div className={s.roleInfo}>
                        <h4 className={s.roleName}>{role.name}</h4>
                        <p className={s.roleDescription}>{role.description || 'No description'}</p>
                      </div>
                      <div className={s.roleActions}>
                        <button
                          type="button"
                          onClick={() => toggleRoleExpanded(role.code)}
                          className={s.expandButton}
                          title={expandedRoles.has(role.code) ? 'Hide permissions' : 'Show permissions'}
                        >
                          {expandedRoles.has(role.code) ? (
                            <ChevronUpIcon className="h-5 w-5 shrink-0" />
                          ) : (
                            <ChevronDownIcon className="h-5 w-5 shrink-0" />
                          )}
                          <span className={s.expandButtonLabel}>
                            {expandedRoles.has(role.code) ? 'Hide permissions' : 'Permissions'}
                          </span>
                        </button>
                        <button
                          onClick={() => setConfirmRemoveRole(role)}
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

                    {expandedRoles.has(role.code) && (
                      <div className={s.rolePermissions}>
                        <h5 className={s.permissionsTitle}>Permissions ({role.permissions.length})</h5>
                        {role.permissions.length === 0 ? (
                          <p className={s.noPermissions}>This role has no permissions.</p>
                        ) : (
                          <ul className={s.permissionsList}>
                            {role.permissions.map((perm) => (
                              <li key={perm.code} className={s.permissionItem}>
                                <span className={s.permissionCode}>{perm.code}</span>
                                <span className={s.permissionDesc}>{perm.description}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Permissions Tab */}
        {activeTab === 'permissions' && (
          <div className={s.tabContent}>
            <div className={s.sectionHeader}>
              <h3 className={s.sectionTitle}>All Permissions</h3>
              <div className={s.sectionActions}>
                <select
                  value={permissionFilter}
                  onChange={(e) => setPermissionFilter(e.target.value as PermissionFilter)}
                  className={s.filterSelect}
                >
                  <option value="all">All</option>
                  <option value="direct">Direct Only</option>
                  <option value="viaRoles">Via Roles Only</option>
                </select>
                <button
                  type="button"
                  onClick={() => setShowAddPermissionModal(true)}
                  className={s.addButton}
                  disabled={availablePermissionsToGrant.length === 0}
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Add Direct Permission
                </button>
              </div>
            </div>

            <div className={s.table}>
              <div className={s.tableHeader}>
                <div className={s.tableRow}>
                  <div className={clsx(s.headerCell, s.flexible)}>Permission</div>
                  <div className={clsx(s.headerCell, s.flexible)}>Description</div>
                  <div className={clsx(s.headerCell, s.fixed)}>Via Roles</div>
                  <div className={clsx(s.headerCell, s.fixed)}>Direct</div>
                  <div className={clsx(s.headerCell, s.fixed)}>Scopes</div>
                  <div className={clsx(s.headerCell, s.fixed)}>Action</div>
                </div>
              </div>
              <div className={s.tableBody}>
                {filteredPermissions.length === 0 ? (
                  <div className={s.emptyState}>No permissions found.</div>
                ) : (
                  filteredPermissions.map((perm) => (
                    <div key={perm.code} className={s.tableRow}>
                      <div className={clsx(s.bodyCell, s.flexible)}>
                        <span className={s.permissionCode}>{perm.code}</span>
                      </div>
                      <div className={clsx(s.bodyCell, s.flexible)}>
                        <span className={s.permissionDesc}>{perm.description || '-'}</span>
                      </div>
                      <div className={clsx(s.bodyCell, s.fixed)}>
                        <PermissionStatusCell viaRoles={perm.viaRoles} isDirect={perm.isDirect} variant="tags" />
                      </div>
                      <div className={clsx(s.bodyCell, s.fixed)}>
                        <PermissionStatusCell viaRoles={perm.viaRoles} isDirect={perm.isDirect} variant="badges" />
                      </div>
                      <div className={clsx(s.bodyCell, s.fixed)}>
                        <div className={s.scopesCell}>
                          {perm.scopes?.length > 0 ? (
                            perm.scopes.map((scope) => (
                              <span key={scope} className={s.scopeTag}>{scope}</span>
                            ))
                          ) : (
                            <span className={s.scopeEmpty}>--</span>
                          )}
                          {perm.isDirect && (
                            <button
                              type="button"
                              onClick={() => setEditScopesPerm(perm)}
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
                      <div className={clsx(s.bodyCell, s.fixed)}>
                        {perm.isDirect ? (
                          <button
                            type="button"
                            onClick={() => handlePermissionActionClick(perm)}
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
                        ) : perm.viaRoles.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setInfoPermission(perm)}
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
            </div>
          </div>
        )}

        {/* Add Role Modal */}
        <AddRoleModal
          isOpen={showAddRoleModal}
          onClose={() => setShowAddRoleModal(false)}
          onAdd={handleAddRole}
          title="Add Role to Member"
          roles={availableRoles}
          isLoading={assignRole.isPending}
        />

        <AddPermissionModal
          isOpen={showAddPermissionModal}
          onClose={() => setShowAddPermissionModal(false)}
          onAdd={handleAddPermission}
          title="Add Direct Permission"
          permissions={availablePermissionsToGrant}
          isLoading={grantPermission.isPending}
        />

        {/* Confirm Remove Role Modal */}
        {confirmRemoveRole && (
          <ConfirmDeleteModal
            isOpen={!!confirmRemoveRole}
            onClose={() => setConfirmRemoveRole(null)}
            onConfirm={handleRemoveRole}
            title="Remove Role"
            message={`Are you sure you want to remove the role "${confirmRemoveRole.name}" from ${member?.name}?`}
            isLoading={revokeRole.isPending}
          />
        )}

        {/* Confirm Remove Permission Modal */}
        {confirmRemovePermission && (
          <ConfirmDeleteModal
            isOpen={!!confirmRemovePermission}
            onClose={closeRemovePermissionModal}
            onConfirm={handleRemovePermission}
            title="Remove Direct Permission"
            message={`Are you sure you want to remove the direct permission "${confirmRemovePermission.code}" from ${member?.name}?`}
            warningNote={removePermissionWarningNote}
            isLoading={revokePermission.isPending}
          />
        )}

        {/* Info Modal for inherited permissions */}
        {infoPermission && (
          <InfoModal
            isOpen={!!infoPermission}
            onClose={() => setInfoPermission(null)}
            title="Cannot Delete Permission"
            message={`This permission is inherited from the following role(s):`}
            items={infoPermission.viaRoles}
          />
        )}

        {/* Edit Scopes Modal */}
        {editScopesPerm && (
          <EditScopesModal
            isOpen={!!editScopesPerm}
            onClose={() => setEditScopesPerm(null)}
            onSave={handleSaveScopes}
            title={`Edit Scopes for ${editScopesPerm.code}`}
            currentScopes={editScopesPerm.scopes ?? []}
            isLoading={updateMemberPermissionScopes.isPending}
          />
        )}
      </div>
    </ApprovalLayout>
  );
};

export default MemberEditPage;
