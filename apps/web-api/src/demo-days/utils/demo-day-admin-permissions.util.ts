import { ADMIN_PERMISSIONS, DEMODAY_PERMISSIONS } from '../../access-control-v2/access-control-v2.constants';
import { MemberWithRoles } from '../../utils/constants';

export const DEMO_DAY_ADMIN_PERMISSION_PREFIX = 'demoday.admin.';

const normalizeHost = (host?: string | null): string =>
  (host ?? '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\+/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const DEMO_DAY_HOST_TO_PERMISSION: Record<string, string> = {
  protocol_labs: DEMODAY_PERMISSIONS.ADMIN_PROTOCOL_LABS,
  protocol_ai: DEMODAY_PERMISSIONS.ADMIN_PROTOCOL_LABS,
  plnetwork_io: DEMODAY_PERMISSIONS.ADMIN_PROTOCOL_LABS,
  founders_forge: DEMODAY_PERMISSIONS.ADMIN_FOUNDERS_FORGE,
  crecimiento: DEMODAY_PERMISSIONS.ADMIN_CRECIMIENTO,
  founder_school: DEMODAY_PERMISSIONS.ADMIN_FOUNDER_SCHOOL,
  crecimiento_founder_school: DEMODAY_PERMISSIONS.ADMIN_CRECIMIENTO_FOUNDER_SCHOOL,
};

export function getDemoDayAdminPermissionForHost(host?: string | null): string | null {
  const key = normalizeHost(host);
  return key ? DEMO_DAY_HOST_TO_PERMISSION[key] ?? `${DEMO_DAY_ADMIN_PERMISSION_PREFIX}${key}` : null;
}

export function getPermissionCodes(member: MemberWithRoles): string[] {
  const directCodes = member.effectivePermissionCodes ?? [];
  const permissionLikeItems = [...(member.effectivePermissions ?? []), ...(member.permissions ?? [])];
  const objectCodes = permissionLikeItems
    .map((permission) => (typeof permission === 'string' ? permission : permission?.code))
    .filter((code): code is string => typeof code === 'string' && code.length > 0);

  return Array.from(new Set([...directCodes, ...objectCodes]));
}

export function hasAnyDemoDayAdminPermission(member: MemberWithRoles): boolean {
  const codes = getPermissionCodes(member);
  return (
    codes.includes(ADMIN_PERMISSIONS.DIRECTORY_FULL) ||
    codes.includes(DEMODAY_PERMISSIONS.ADMIN_ALL) ||
    codes.some((code) => code.startsWith(DEMO_DAY_ADMIN_PERMISSION_PREFIX))
  );
}

export function hasDemoDayAdminPermissionForHost(member: MemberWithRoles, host?: string | null): boolean {
  const codes = getPermissionCodes(member);
  const hostPermission = getDemoDayAdminPermissionForHost(host);
  return (
    codes.includes(ADMIN_PERMISSIONS.DIRECTORY_FULL) ||
    codes.includes(DEMODAY_PERMISSIONS.ADMIN_ALL) ||
    (!!hostPermission && codes.includes(hostPermission))
  );
}
