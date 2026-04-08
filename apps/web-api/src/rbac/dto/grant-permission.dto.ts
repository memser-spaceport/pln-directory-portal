export class GrantPermissionDto {
  memberUid: string;

  permissionCode: string;

  grantedByMemberUid?: string;

  scopes?: string[];
}
