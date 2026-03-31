import { SetMetadata } from '@nestjs/common';

export const RBAC_PERMISSIONS_KEY = 'rbac_permissions';
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(RBAC_PERMISSIONS_KEY, permissions);
