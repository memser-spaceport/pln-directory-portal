import { RbacService } from './rbac.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';

/**
 * Legacy v1 permission codes that also (or instead) live as v2 permission codes.
 * Kept alongside RbacGuard's copy of the same table so both the guard pipeline
 * and out-of-pipeline callers (e.g. Husky tools) resolve a permission identically.
 */
const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = {
  'founder_guides.view': ['founder_guides.view.all', 'founder_guides.view.plvs', 'founder_guides.view.plcc'],
  'founder_guides.create': ['founder_guides.create'],
  'deals.view': ['deals.read'],
  'demo_day.report_link.view': ['demoday.report_link.read'],
  'membership.source.read': ['team.membership_source.read'],
  'team.membership_source.read': ['membership.source.read'],
};

function permissionCandidates(permission: string): string[] {
  return Array.from(new Set([permission, ...(LEGACY_PERMISSION_ALIASES[permission] ?? [])]));
}

/**
 * Resolves whether `memberUid` has `permission`, checking the v2 access-control
 * service (including legacy aliases) before falling back to the v1 RBAC service.
 * This mirrors RbacGuard.hasPermission so out-of-pipeline callers (Husky tools,
 * background jobs) apply the exact same rules a guarded route would.
 */
export async function memberHasPermission(
  rbacService: Pick<RbacService, 'hasPermission'>,
  accessControlV2Service: Pick<AccessControlV2Service, 'hasPermission'>,
  memberUid: string,
  permission: string
): Promise<boolean> {
  // Candidates are alternatives (any allowed => true), so check them concurrently
  // rather than paying for each round trip serially before falling back to v1.
  const v2Results = await Promise.all(
    permissionCandidates(permission).map((candidate) =>
      accessControlV2Service.hasPermission(memberUid, candidate).then(
        (check) => check.allowed,
        () => false // Intentionally fall through to the v1 check.
      )
    )
  );
  if (v2Results.some(Boolean)) {
    return true;
  }
  return rbacService.hasPermission(memberUid, permission);
}

/** True as soon as any one of `permissions` resolves true via {@link memberHasPermission}. */
export async function memberHasAnyPermission(
  rbacService: Pick<RbacService, 'hasPermission'>,
  accessControlV2Service: Pick<AccessControlV2Service, 'hasPermission'>,
  memberUid: string,
  permissions: readonly string[]
): Promise<boolean> {
  const results = await Promise.all(
    permissions.map((permission) => memberHasPermission(rbacService, accessControlV2Service, memberUid, permission))
  );
  return results.some(Boolean);
}
