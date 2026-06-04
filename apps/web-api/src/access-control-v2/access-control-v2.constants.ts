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

export const TEAM_PITCH_PERMISSIONS = {
  ADMIN: 'team_pitch.admin',
} as const;

export const DEMODAY_PERMISSIONS = {
  /** Read demo day fundraiser / analytics report link */
  REPORT_LINK_READ: 'demoday.report_link.read',
  /** Full admin access to all Demo Day hosts */
  ADMIN_ALL: 'demoday.admin.all',
  /** Host-specific Demo Day admin access */
  ADMIN_PROTOCOL_LABS: 'demoday.admin.protocol_labs',
  ADMIN_FOUNDERS_FORGE: 'demoday.admin.founders_forge',
  ADMIN_CRECIMIENTO: 'demoday.admin.crecimiento',
  ADMIN_FOUNDER_SCHOOL: 'demoday.admin.founder_school',
  ADMIN_CRECIMIENTO_FOUNDER_SCHOOL: 'demoday.admin.crecimiento_founder_school',
  /** Read demo day statistics */
  STATS_READ: 'demoday.stats.read',
} as const;

// ── Members ─────────────────────────────────────────────────────────────

export const MEMBER_PERMISSIONS = {
  /** Read access to member search */
  SEARCH_READ: 'member.search.read',
  /** Read access to member contacts (email, etc.) */
  CONTACTS_READ: 'member.contacts.read',
  /** Access to onboarding flow (replaces L4-based onboarding) */
  ONBOARDING: 'member.onboarding',
  /** Manage investor-only settings and profile actions */
  INVESTOR_MANAGE: 'member.investor.manage',
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

export const TEAM_MEMBERSHIP_PERMISSIONS = {
  /** Read access to the Membership Source section on team pages */
  SOURCE_READ: 'team.membership_source.read',
  /** @deprecated use team.membership_source.read */
  SOURCE_READ_LEGACY: 'membership.source.read',
} as const;

export const MEMBERSHIP_PERMISSIONS = TEAM_MEMBERSHIP_PERMISSIONS;

// ── PL Advisors ───────────────────────────────────────────────────────────

export const PL_ADVISORS_PERMISSIONS = {
  /** Access to PL advisors features */
  ACCESS: 'pl.advisors.access',
} as const;

// ── Roadmap (Gantry) ──────────────────────────────────────────────────────

export const ROADMAP_PERMISSIONS = {
  /** Aggregate grant: implies every other roadmap permission */
  ADMIN: 'roadmap.admin',
  VIEW: 'roadmap.view',
  IDEA_CREATE: 'roadmap.idea.create',
  ITEM_UPVOTE: 'roadmap.item.upvote',
  ITEM_EDIT_OWN: 'roadmap.item.edit_own',
  ITEM_CURATE: 'roadmap.item.curate',
  ITEM_TRANSITION: 'roadmap.item.transition',
} as const;

/** Every fine-grained roadmap permission that `roadmap.admin` expands into. */
export const ROADMAP_ADMIN_GRANTS = [
  ROADMAP_PERMISSIONS.VIEW,
  ROADMAP_PERMISSIONS.IDEA_CREATE,
  ROADMAP_PERMISSIONS.ITEM_UPVOTE,
  ROADMAP_PERMISSIONS.ITEM_EDIT_OWN,
  ROADMAP_PERMISSIONS.ITEM_CURATE,
  ROADMAP_PERMISSIONS.ITEM_TRANSITION,
] as const;

/**
 * Aggregate permissions that, when granted (via policy or direct assignment),
 * expand into a set of finer-grained permissions in a member's effective permissions.
 */
export const PERMISSION_GRANT_EXPANSIONS: Record<string, readonly string[]> = {
  [ROADMAP_PERMISSIONS.ADMIN]: ROADMAP_ADMIN_GRANTS,
};

/** Expand a set of permission codes, resolving any aggregate grants. */
export function expandEffectivePermissions(codes: Iterable<string>): string[] {
  const result = new Set<string>();
  for (const code of codes) {
    result.add(code);
    const grants = PERMISSION_GRANT_EXPANSIONS[code];
    if (grants) {
      grants.forEach((granted) => result.add(granted));
    }
  }
  return Array.from(result);
}

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
  'demo_day.report_link.view': [DEMODAY_PERMISSIONS.REPORT_LINK_READ],
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
  DEMODAY_PERMISSIONS.REPORT_LINK_READ,
  DEMODAY_PERMISSIONS.ADMIN_ALL,
  DEMODAY_PERMISSIONS.ADMIN_PROTOCOL_LABS,
  DEMODAY_PERMISSIONS.ADMIN_FOUNDERS_FORGE,
  DEMODAY_PERMISSIONS.ADMIN_CRECIMIENTO,
  DEMODAY_PERMISSIONS.ADMIN_FOUNDER_SCHOOL,
  DEMODAY_PERMISSIONS.ADMIN_CRECIMIENTO_FOUNDER_SCHOOL,
  DEMODAY_PERMISSIONS.STATS_READ,

  TEAM_PITCH_PERMISSIONS.ADMIN,

  // Members
  MEMBER_PERMISSIONS.SEARCH_READ,
  MEMBER_PERMISSIONS.CONTACTS_READ,
  MEMBER_PERMISSIONS.ONBOARDING,
  MEMBER_PERMISSIONS.INVESTOR_MANAGE,

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
  TEAM_MEMBERSHIP_PERMISSIONS.SOURCE_READ,
  TEAM_MEMBERSHIP_PERMISSIONS.SOURCE_READ_LEGACY,

  // PL Advisors
  PL_ADVISORS_PERMISSIONS.ACCESS,

  // Roadmap
  ROADMAP_PERMISSIONS.ADMIN,
  ROADMAP_PERMISSIONS.VIEW,
  ROADMAP_PERMISSIONS.IDEA_CREATE,
  ROADMAP_PERMISSIONS.ITEM_UPVOTE,
  ROADMAP_PERMISSIONS.ITEM_EDIT_OWN,
  ROADMAP_PERMISSIONS.ITEM_CURATE,
  ROADMAP_PERMISSIONS.ITEM_TRANSITION,
] as const;

// ── Type Exports ─────────────────────────────────────────────────────────

/** Type representing any valid permission code */
export type PermissionCode = typeof ALL_PERMISSION_CODES[number];

/** Type representing founder guides permission codes */
export type FounderGuidesPermissionCode = typeof FOUNDER_GUIDES_PERMISSIONS[keyof typeof FOUNDER_GUIDES_PERMISSIONS];

/** Type representing demoday permission codes */
export type DemodayPermissionCode = typeof DEMODAY_PERMISSIONS[keyof typeof DEMODAY_PERMISSIONS];

/** Type representing member permission codes */
export type MemberPermissionCode = typeof MEMBER_PERMISSIONS[keyof typeof MEMBER_PERMISSIONS];

/** Type representing forum permission codes */
export type ForumPermissionCode = typeof FORUM_PERMISSIONS[keyof typeof FORUM_PERMISSIONS];

/** Type representing office hours permission codes */
export type OfficeHoursPermissionCode = typeof OFFICE_HOURS_PERMISSIONS[keyof typeof OFFICE_HOURS_PERMISSIONS];
