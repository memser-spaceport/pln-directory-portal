/**
 * Mirrors web-api demo-day-admin-permissions.util for Back Office UI (host ↔ permission mapping).
 */

import { ADMIN_PERMISSIONS, DEMODAY_PERMISSIONS } from './constants';

const ADMIN_PREFIX = 'demoday.admin.';

const normalizeHostKey = (host?: string | null): string =>
  (host ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

/** Same keys as DEMO_DAY_HOST_TO_PERMISSION on the API */
const DEMO_DAY_HOST_TO_PERMISSION: Record<string, string> = {
  protocol_labs: DEMODAY_PERMISSIONS.ADMIN_PROTOCOL_LABS,
  protocol_ai: DEMODAY_PERMISSIONS.ADMIN_PROTOCOL_LABS,
  plnetwork_io: DEMODAY_PERMISSIONS.ADMIN_PROTOCOL_LABS,
  founders_forge: DEMODAY_PERMISSIONS.ADMIN_FOUNDERS_FORGE,
  crecimiento: DEMODAY_PERMISSIONS.ADMIN_CRECIMIENTO,
  founder_school: DEMODAY_PERMISSIONS.ADMIN_FOUNDER_SCHOOL,
  crecimiento_founder_school: DEMODAY_PERMISSIONS.ADMIN_CRECIMIENTO_FOUNDER_SCHOOL,
};

function permissionCodeForStoredHost(host?: string | null): string | null {
  const key = normalizeHostKey(host);
  if (!key) return null;
  return DEMO_DAY_HOST_TO_PERMISSION[key] ?? `${ADMIN_PREFIX}${key}`;
}

export function hasDemoDayAdminPermissionForHost(permissions: string[], demoDayHost?: string | null): boolean {
  if (permissions.includes(ADMIN_PERMISSIONS.DIRECTORY_FULL) || permissions.includes(DEMODAY_PERMISSIONS.ADMIN_ALL)) {
    return true;
  }
  const hostPermission = permissionCodeForStoredHost(demoDayHost);
  return !!hostPermission && permissions.includes(hostPermission);
}

/** Host option values that the current user may create demo days for */
export function allowedHostValuesForUser(permissions: string[], allHostValues: string[]): string[] {
  if (permissions.includes(ADMIN_PERMISSIONS.DIRECTORY_FULL) || permissions.includes(DEMODAY_PERMISSIONS.ADMIN_ALL)) {
    return allHostValues;
  }
  return allHostValues.filter((h) => hasDemoDayAdminPermissionForHost(permissions, h));
}
