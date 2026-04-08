export class UpdateMemberPermissionScopesDto {
  memberUid: string;
  permissionCode: string;
  scopes: string[];
}

export class UpdateRolePermissionScopesDto {
  roleCode: string;
  permissionCode: string;
  scopes: string[];
}
