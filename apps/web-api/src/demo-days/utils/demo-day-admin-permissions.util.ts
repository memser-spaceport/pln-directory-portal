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

/** Prisma member slice with V2 permissions (as loaded by getMemberWithDemoDayParticipants). */
export type MemberPermissionRelations = {
  memberPermissionsV2?: { permission: { code: string } }[];
  policyAssignmentsV2?: {
    policy: { policyPermissions: { permission: { code: string } }[] };
  }[];
};

/** Flatten assigned permission codes from DB relations (JWT may not be available in this code path). */
export function flattenPermissionCodesFromMemberRelations(member: MemberPermissionRelations): string[] {
  return Array.from(
    new Set([
      ...(member.memberPermissionsV2 ?? []).map((p) => p.permission.code),
      ...(member.policyAssignmentsV2 ?? []).flatMap((a) => a.policy.policyPermissions.map((p) => p.permission.code)),
    ])
  );
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

/** Host-scoped demoday.admin.* (excludes demoday.admin.all which is universal). */
export function hasHostScopedDemoDayAdminCode(codes: string[]): boolean {
  return codes.some(
    (c) =>
      c.startsWith(DEMO_DAY_ADMIN_PERMISSION_PREFIX) &&
      c !== DEMODAY_PERMISSIONS.ADMIN_ALL &&
      c.length > DEMO_DAY_ADMIN_PERMISSION_PREFIX.length
  );
}

export function canReassignDemoDayHost(codes: string[]): boolean {
  return codes.includes(ADMIN_PERMISSIONS.DIRECTORY_FULL) || codes.includes(DEMODAY_PERMISSIONS.ADMIN_ALL);
}

export function hasDirectoryFullOrDemoDayAll(codes: string[]): boolean {
  return codes.includes(ADMIN_PERMISSIONS.DIRECTORY_FULL) || codes.includes(DEMODAY_PERMISSIONS.ADMIN_ALL);
}
