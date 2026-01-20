const APP_CONSTANTS = {
  AUTO_APPROVED_LABEL: 'AUTOAPPROVED',
  APPROVED_LABEL: 'Approved',
  PENDING_LABEL: 'PENDING',
  PENDING_FLAG: 'Pending',
  UNVERIFIED_LABEL: 'UNVERIFIED',
  UNVERIFIED_FLAG: 'Unverified',
  VERIFIED_FLAG: 'Verified',
  REJECTED_LABEL: 'Rejected',
  APPROVED_FLAG: 'APPROVED',
  REJECTED_FLAG: 'REJECTED',
  CLOSED_FLAG: 'CLOSED',
  MEMBER_LABEL: 'Members',
  RECOMMENDATIONS_LABEL: 'Recommendations',
  TEAMS_LABEL: 'Teams',
  NO_DATA_AVAILABLE_LABEL: 'No data available',
  VIEW_CLOSED_REQUEST_LABEL: 'View closed requests',
  EXIT_CLOSED_REQUEST_LABEL: 'Exit closed requests',
  VIEW_RECOMMENDATIONS_LABEL: 'View recommendations',
  BACK_OFFICE_LABEL: 'Back Office',
  SLASH: '/',
  LOADING_CONTENT: 'Loading...',
  V1: '/v1/',
};

export const TABLE_SORT_ICONS = {
  DEFAULT: '/assets/icons/group.svg',
  ASCENDING: '/assets/icons/sort-asc-blue.svg',
  DESCENDING: '/assets/icons/sort-desc-blue.svg',
};

export const TABLE_SORT_VALUES = {
  DEFAULT: 'DEFAULT',
  ASCENDING: 'ASCENDING',
  DESCENDING: 'DESCENDING',
};

export const ENROLLMENT_TYPE = {
  MEMBER: 'MEMBER',
  TEAM: 'TEAM',
};

export const ROUTE_CONSTANTS = {
  PENDING_LIST: APP_CONSTANTS.SLASH + 'pending-list',
  CLOSED_LIST: APP_CONSTANTS.SLASH + 'closed-list',
  TEAM_VIEW: APP_CONSTANTS.SLASH + 'team-view',
  MEMBER_VIEW: APP_CONSTANTS.SLASH + 'member-view',
  RECOMMENDATIONS_RUNS: APP_CONSTANTS.SLASH + 'recommendations/runs',
  RECOMMENDATIONS_HISTORY: APP_CONSTANTS.SLASH + 'recommendations/history',
  RECOMMENDATIONS_MEMBERS: APP_CONSTANTS.SLASH + 'recommendations/members',
  INTERNAL_SERVER_ERROR: APP_CONSTANTS.SLASH + 'internal-server-error',
};

export const API_ROUTE = {
  PARTICIPANTS_REQUEST: APP_CONSTANTS.V1 + 'admin/participants-request',
  TEAMS: APP_CONSTANTS.V1 + 'teams',
  SKILLS: APP_CONSTANTS.V1 + 'skills',
  IMAGES: APP_CONSTANTS.V1 + 'images',
  MEMBERSHIP: APP_CONSTANTS.V1 + 'membership-sources',
  FUNDING_STAGE: APP_CONSTANTS.V1 + 'funding-stages',
  INDUSTRIES: APP_CONSTANTS.V1 + 'industry-tags',
  TECHNOLOGIES: APP_CONSTANTS.V1 + 'technologies',
  MEMBERS: APP_CONSTANTS.V1 + 'members',
  ADMIN_APPROVAL: APP_CONSTANTS.V1 + 'admin/members',
  ADMIN_RECOMMENDATIONS: APP_CONSTANTS.V1 + 'admin/recommendations',
  ADMIN_MEMBERS: `${APP_CONSTANTS.V1}admin/members`,
  ADMIN_DEMO_DAYS: `${APP_CONSTANTS.V1}admin/demo-days`,
  ADMIN_DEMO_DAY_SUBSCRIBERS: `${APP_CONSTANTS.V1}admin/demo-days/subscribers`,
  ADMIN_IRL_GATHERING_PUSH_CONFIG: `${APP_CONSTANTS.V1}admin/irl-gathering-push-config`,
  ADMIN_IRL_GATHERING_PUSH_CONFIG_ACTIVE: `${APP_CONSTANTS.V1}admin/irl-gathering-push-config/active`,
  ADMIN_IRL_GATHERING_PUSH_NOTIFICATIONS: `${APP_CONSTANTS.V1}admin/irl-gathering-push-notifications`,
  ADMIN_IRL_GATHERING_PUSH_NOTIFICATIONS_LOCATIONS: `${APP_CONSTANTS.V1}admin/irl-gathering-push-notifications/locations`,
  ADMIN_IRL_GATHERING_PUSH_NOTIFICATIONS_TRIGGER: `${APP_CONSTANTS.V1}admin/irl-gathering-push-notifications/trigger`,

};

export const TOKEN = 'plnetwork@1';

export const FILTER_API_ROUTES = {
  FOCUS_AREA: '/v1/focus-areas',
};

export const ABOUT_PLN_LINK =
  'https://protocol.ai/blog/transcription-pl-vision-driving-a-breakthroughs-in-computing-to-push-humanity-forward/';

export default APP_CONSTANTS;

export const WEB_UI_BASE_URL = process.env.WEB_UI_BASE_URL || 'https://directory.plnetwork.io';

/**
 * Member roles enum for the application.
 * - DIRECTORY_ADMIN: Full system administration (super role)
 * - DEMO_DAY_ADMIN: Can manage Demo Days they are assigned to
 */
export enum MemberRole {
  DIRECTORY_ADMIN = 'DIRECTORYADMIN',
  DEMO_DAY_ADMIN = 'DEMO_DAY_ADMIN',
}

export const INVESTOR_PROFILE_CONSTANTS = {
  STAGES: [
    { label: 'Pre-seed', value: 'pre-seed' },
    { label: 'Seed', value: 'seed' },
    { label: 'Series A', value: 'series-a' },
    { label: 'Series B', value: 'series-b' },
    { label: 'Series C', value: 'series-c' },
    { label: 'Series D and later', value: 'series-d-and-later' },
  ],
  FUND_TYPES: [
    { label: "I don't invest in VC Funds", value: 'do-not-invest' },
    { label: 'Early stage', value: 'early-stage' },
    { label: 'Late stage', value: 'late-stage' },
    { label: 'Fund-of-funds', value: 'fund-of-funds' },
  ],
  INVESTOR_TYPES: [
    { label: 'I angel invest', value: 'ANGEL' },
    { label: 'I invest through fund(s)', value: 'FUND' },
    { label: 'I angel invest + invest through fund(s)', value: 'ANGEL_AND_FUND' },
  ],
};
