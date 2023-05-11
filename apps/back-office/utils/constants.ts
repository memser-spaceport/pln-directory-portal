const APP_CONSTANTS = {
  APPROVED_LABEL: 'Approved',
  PENDING_LABEL: 'PENDING',
  REJECTED_LABEL: 'Rejected',
  APPROVED_FLAG: 'APPROVED',
  REJECTED_FLAG: 'REJECTED',
  CLOSED_FLAG: 'CLOSED',
  MEMBER_LABEL: 'Members',
  TEAMS_LABEL: 'Teams',
  NO_DATA_AVAILABLE_LABEL: 'No data available',
  VIEW_CLOSED_REQUEST_LABEL: 'View closed requests',
  EXIT_CLOSED_REQUEST_LABEL: 'Exit closed requests',
  BACK_OFFICE_LABEL: 'Back Office',
  SLASH: '/',
  LOADING_CONTENT: 'Loading...',
  V1: '/v1/',
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
  INTERNAL_SERVER_ERROR: APP_CONSTANTS.SLASH + 'internal-server-error',
};

export const API_ROUTE = {
  PARTICIPANTS_REQUEST: APP_CONSTANTS.V1 + 'admin/participants',
  TEAMS: APP_CONSTANTS.V1 + 'teams',
  SKILLS: APP_CONSTANTS.V1 + 'skills',
  IMAGES: APP_CONSTANTS.V1 + 'images',
  MEMBERSHIP: APP_CONSTANTS.V1 + 'membership-sources',
  FUNDING_STAGE: APP_CONSTANTS.V1 + 'funding-stages',
  INDUSTRIES: APP_CONSTANTS.V1 + 'industry-tags',
  TECHNOLOGIES: APP_CONSTANTS.V1 + 'technologies',
  MEMBERS: APP_CONSTANTS.V1 + 'members',
};

export const TOKEN = 'plnetwork@1';

export default APP_CONSTANTS;
