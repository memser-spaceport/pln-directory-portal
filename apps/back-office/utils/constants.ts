const APP_CONSTANTS = {
  APPROVED_LABEL: 'Approved',
  PENDING_LABEL: 'PENDING',
  REJECTED_LABEL: 'Rejected',
  APPROVED_FLAG: 'APPROVED',
  CLOSED_FLAG: 'CLOSED',
  MEMBER_LABEL: 'Member',
  TEAMS_LABEL: 'Teams',
  NO_DATA_AVAILABLE_LABEL: 'No data available',
  VIEW_CLOSED_REQUEST_LABEL: 'View closed requests',
  EXIT_CLOSED_REQUEST_LABEL: 'Exit closed requests',
  BACK_OFFICE_LABEL: 'Back Office',
  SLASH: '/',
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
};

export const TOKEN = 'plnetwork@1';

export default APP_CONSTANTS;
