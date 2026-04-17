export interface MemberBasic {
  uid: string;
  name: string;
  email: string;
  image?: { url: string } | null;
}

export interface TeamMemberRoleInfo {
  role?: string | null;
  team: {
    uid: string;
    name: string;
  };
}

export interface RoleBasic {
  uid: string;
  code: string;
  name: string;
  description?: string | null;
}

export interface PermissionBasic {
  uid: string;
  code: string;
  description?: string | null;
  scopes?: string[];
}

// Keep in sync with apps/web-api/src/rbac/rbac.constants.ts RBAC_SCOPES
export const AVAILABLE_SCOPES = ['PLVS', 'PLCC'] as const;

export interface MemberWithRoles extends MemberBasic {
  teamMemberRoles: TeamMemberRoleInfo[];
  roles: RoleBasic[];
  directPermissions: PermissionBasic[];
}

export interface RoleWithCounts extends RoleBasic {
  memberCount: number;
  permissionCount: number;
  permissions: PermissionBasic[];
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RoleDetails extends RoleBasic {
  permissions: PermissionBasic[];
  members: Array<MemberBasic & { teamMemberRoles: TeamMemberRoleInfo[] }>;
  pagination: PaginationInfo;
}

export interface PermissionWithCounts extends PermissionBasic {
  roleCount: number;
  roles: Array<RoleBasic & { memberCount: number }>;
  directMemberCount: number;
  directMembers: MemberBasic[];
  totalMemberCount: number;
}

export interface PermissionDetails extends PermissionBasic {
  roles: Array<RoleBasic & { memberCount: number; scopes: string[] }>;
  members: Array<
    MemberBasic & { viaRoles: string[]; isDirect: boolean; teamMemberRoles: TeamMemberRoleInfo[]; scopes: string[] }
  >;
  pagination: PaginationInfo;
}

export interface MemberAccessDetails {
  member: MemberBasic & {
    teamMemberRoles: TeamMemberRoleInfo[];
  };
  roles: Array<RoleBasic & { permissions: PermissionBasic[] }>;
  directPermissions: PermissionBasic[];
  allPermissions: Array<PermissionBasic & { viaRoles: string[]; isDirect: boolean; scopes: string[] }>;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface MembersListResponse {
  members: MemberWithRoles[];
  pagination: PaginationInfo;
}
