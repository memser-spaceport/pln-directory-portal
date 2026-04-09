export type PermissionWithScopes = {
  name: string;
  scopes: string[];
};

export type CurrentUserAccessDto = {
  memberUid: string;
  roles: string[];
  permissions: PermissionWithScopes[];
};
