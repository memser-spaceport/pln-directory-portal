export const RBAC_ROLE_CODES = {
  DIRECTORY_ADMIN: 'DIRECTORY_ADMIN',
  PL_VS_FOUNDER: 'PL_VS_FOUNDER',
} as const;

export const RBAC_PERMISSION_CODES = {
  FOUNDER_GUIDES_VIEW: 'founder_guides.view',
  FOUNDER_GUIDES_CREATE: 'founder_guides.create',
  DEMO_DAY_REPORT_LINK_READ: 'demoday.report_link.read',
  DEMO_DAY_STATS_READ: 'demoday.stats.read',
  DEALS_VIEW: 'deals.read',
  IRLG_GOING_WRITE: 'irlg.going.write',
  DIRECTORY_ADMIN: 'directory.admin.full',
  ADMIN_TOOLS_ACCESS: 'admin.tools.access',
  TEAM_MEMBERSHIP_SOURCE_READ: 'team.membership_source.read',
  INVESTOR_DB_VIEW: 'investor_db.view',
  INVESTOR_DB_EDIT: 'investor_db.edit',
} as const;

export const RBAC_SCOPES = {
  PLVS: 'PLVS',
  PLCC: 'PLCC',
} as const;

export const AVAILABLE_SCOPES = Object.values(RBAC_SCOPES);
