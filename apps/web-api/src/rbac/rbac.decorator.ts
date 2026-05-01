import { SetMetadata } from '@nestjs/common';

export const RBAC_PERMISSIONS_KEY = 'rbac_permissions';
export type RequiredPermissions = {
  allOf?: string[];
  anyOf?: string[];
};

export const RequirePermissions = (permissions: RequiredPermissions) => SetMetadata(RBAC_PERMISSIONS_KEY, permissions);
