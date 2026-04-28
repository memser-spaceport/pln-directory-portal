/**
 * Access Control V2 - Permission Constants
 *
 * This file contains all permission codes used in the Access Control V2 system.
 * Permissions are organized by functional domain.
 */

// ── Founder Guides / Articles ────────────────────────────────────────────

export const FOUNDER_GUIDES_PERMISSIONS = {
  /** View PLVS-specific founder guides */
  VIEW_PLVS: 'founder_guides.view.plvs',
  /** View PLCC-specific founder guides */
  VIEW_PLCC: 'founder_guides.view.plcc',
  /** View all founder guides (supercedes PLVS/PLCC) */
  VIEW_ALL: 'founder_guides.view.all',
  /** Create new founder guides */
  CREATE: 'founder_guides.create',
} as const;

// ── Deals ───────────────────────────────────────────────────────────────

export const DEALS_PERMISSIONS = {
  /** Read access to deals */
  READ: 'deals.read',
} as const;

// ── Demo Day ────────────────────────────────────────────────────────────

export const DEMO_DAY_PERMISSIONS = {
  /** View demo day report links */
  REPORT_LINK_VIEW: 'demo_day.report_link.view',
} as const;

export const DEMODAY_PERMISSIONS = {
  /** Read access to demo day prep */
  PREP_READ: 'demoday.prep.read',
  /** Write access to demo day prep */
  PREP_WRITE: 'demoday.prep.write',
  /** Read access to demo day showcase */
  SHOWCASE_READ: 'demoday.showcase.read',
  /** Write access to demo day showcase */
  SHOWCASE_WRITE: 'demoday.showcase.write',
  /** Read access to active demo days */
  ACTIVE_READ: 'demoday.active.read',
  /** Write access to active demo days */
  ACTIVE_WRITE: 'demoday.active.write',
  /** Read demo day statistics */
  STATS_READ: 'demoday.stats.read',
} as const;

// ── Members ─────────────────────────────────────────────────────────────

export const MEMBER_PERMISSIONS = {
  /** Read access to member search */
  SEARCH_READ: 'member.search.read',
  /** Read access to member contacts (email, etc.) */
  CONTACTS_READ: 'member.contacts.read',
} as const;

// ── Forum ───────────────────────────────────────────────────────────────

export const FORUM_PERMISSIONS = {
  /** Read access to forum */
  READ: 'forum.read',
  /** Write access to forum (post, reply) */
  WRITE: 'forum.write',
} as const;

// ── Office Hours ──────────────────────────────────────────────────────────

export const OFFICE_HOURS_PERMISSIONS = {
  /** Read office hours supply (providers) */
  SUPPLY_READ: 'oh.supply.read',
  /** Write office hours supply (offer office hours) */
  SUPPLY_WRITE: 'oh.supply.write',
  /** Read office hours demand (requests) */
  DEMAND_READ: 'oh.demand.read',
  /** Write office hours demand (request office hours) */
  DEMAND_WRITE: 'oh.demand.write',
} as const;

// ── IRL Gatherings ───────────────────────────────────────────────────────

export const IRL_GATHERINGS_PERMISSIONS = {
  /** Read "going" status for IRL gatherings */
  GOING_READ: 'irlg.going.read',
  /** Write "going" status for IRL gatherings (RSVP) */
  GOING_WRITE: 'irlg.going.write',
} as const;

// ── Admin / Directory Management ─────────────────────────────────────────

export const ADMIN_PERMISSIONS = {
  /** Full directory admin access */
  DIRECTORY_FULL: 'directory.admin.full',
  /** Access to admin tools */
  TOOLS_ACCESS: 'admin.tools.access',
} as const;

// ── Team ─────────────────────────────────────────────────────────────────

export const TEAM_PERMISSIONS = {
  /** Read access to team search */
  SEARCH_READ: 'team.search.read',
  /** Read access to team priority data */
  PRIORITY_READ: 'team.priority.read',
} as const;

// ── Membership ────────────────────────────────────────────────────────────

export const MEMBERSHIP_PERMISSIONS = {
  /** Read access to membership source data */
  SOURCE_READ: 'membership.source.read',
} as const;

// ── PL Advisors ───────────────────────────────────────────────────────────

export const PL_ADVISORS_PERMISSIONS = {
  /** Access to PL advisors features */
  ACCESS: 'pl.advisors.access',
} as const;

// ── Legacy Permission Aliases ───────────────────────────────────────────

/**
 * Legacy permission codes that map to V2 permissions.
 * Used for backward compatibility during RBAC V1 → V2 migration.
 */
export const LEGACY_PERMISSION_ALIASES = {
  'founder_guides.view': [
    FOUNDER_GUIDES_PERMISSIONS.VIEW_ALL,
    FOUNDER_GUIDES_PERMISSIONS.VIEW_PLVS,
    FOUNDER_GUIDES_PERMISSIONS.VIEW_PLCC,
  ],
  'founder_guides.create': [FOUNDER_GUIDES_PERMISSIONS.CREATE],
  'deals.view': [DEALS_PERMISSIONS.READ],
  'demo_day.report_link.view': [DEMO_DAY_PERMISSIONS.REPORT_LINK_VIEW],
} as const;

// ── All Permissions Array ────────────────────────────────────────────────

/** Complete list of all permission codes in the system */
export const ALL_PERMISSION_CODES = [
  // Founder Guides
  FOUNDER_GUIDES_PERMISSIONS.VIEW_PLVS,
  FOUNDER_GUIDES_PERMISSIONS.VIEW_PLCC,
  FOUNDER_GUIDES_PERMISSIONS.VIEW_ALL,
  FOUNDER_GUIDES_PERMISSIONS.CREATE,

  // Deals
  DEALS_PERMISSIONS.READ,

  // Demo Day
  DEMO_DAY_PERMISSIONS.REPORT_LINK_VIEW,
  DEMODAY_PERMISSIONS.PREP_READ,
  DEMODAY_PERMISSIONS.PREP_WRITE,
  DEMODAY_PERMISSIONS.SHOWCASE_READ,
  DEMODAY_PERMISSIONS.SHOWCASE_WRITE,
  DEMODAY_PERMISSIONS.ACTIVE_READ,
  DEMODAY_PERMISSIONS.ACTIVE_WRITE,
  DEMODAY_PERMISSIONS.STATS_READ,

  // Members
  MEMBER_PERMISSIONS.SEARCH_READ,
  MEMBER_PERMISSIONS.CONTACTS_READ,

  // Forum
  FORUM_PERMISSIONS.READ,
  FORUM_PERMISSIONS.WRITE,

  // Office Hours
  OFFICE_HOURS_PERMISSIONS.SUPPLY_READ,
  OFFICE_HOURS_PERMISSIONS.SUPPLY_WRITE,
  OFFICE_HOURS_PERMISSIONS.DEMAND_READ,
  OFFICE_HOURS_PERMISSIONS.DEMAND_WRITE,

  // IRL Gatherings
  IRL_GATHERINGS_PERMISSIONS.GOING_READ,
  IRL_GATHERINGS_PERMISSIONS.GOING_WRITE,

  // Admin
  ADMIN_PERMISSIONS.DIRECTORY_FULL,
  ADMIN_PERMISSIONS.TOOLS_ACCESS,

  // Team
  TEAM_PERMISSIONS.SEARCH_READ,
  TEAM_PERMISSIONS.PRIORITY_READ,

  // Membership
  MEMBERSHIP_PERMISSIONS.SOURCE_READ,

  // PL Advisors
  PL_ADVISORS_PERMISSIONS.ACCESS,
] as const;

// ── Type Exports ─────────────────────────────────────────────────────────

/** Type representing any valid permission code */
export type PermissionCode = typeof ALL_PERMISSION_CODES[number];

/** Type representing founder guides permission codes */
export type FounderGuidesPermissionCode = typeof FOUNDER_GUIDES_PERMISSIONS[keyof typeof FOUNDER_GUIDES_PERMISSIONS];

/** Type representing demo day permission codes */
export type DemoDayPermissionCode = typeof DEMO_DAY_PERMISSIONS[keyof typeof DEMO_DAY_PERMISSIONS];

/** Type representing demoday (detailed) permission codes */
export type DemodayPermissionCode = typeof DEMODAY_PERMISSIONS[keyof typeof DEMODAY_PERMISSIONS];

/** Type representing member permission codes */
export type MemberPermissionCode = typeof MEMBER_PERMISSIONS[keyof typeof MEMBER_PERMISSIONS];

/** Type representing forum permission codes */
export type ForumPermissionCode = typeof FORUM_PERMISSIONS[keyof typeof FORUM_PERMISSIONS];

/** Type representing office hours permission codes */
export type OfficeHoursPermissionCode = typeof OFFICE_HOURS_PERMISSIONS[keyof typeof OFFICE_HOURS_PERMISSIONS];
