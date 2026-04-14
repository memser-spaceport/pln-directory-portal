export class GrantRolePermissionDto {
  roleCode: string;

  permissionCode: string;

  scopes?: string[];
}
