export const RBAC_ROLE_CODES = {
  DIRECTORY_ADMIN: 'DIRECTORY_ADMIN',
  PL_VS_FOUNDER: 'PL_VS_FOUNDER',
} as const;

export const RBAC_PERMISSION_CODES = {
  FOUNDER_GUIDES_VIEW: 'founder_guides.view',
  FOUNDER_GUIDES_CREATE: 'founder_guides.create',
} as const;

export const RBAC_SCOPES = {
  PLVS: 'PLVS',
  PLCC: 'PLCC',
} as const;

export const AVAILABLE_SCOPES = Object.values(RBAC_SCOPES);
