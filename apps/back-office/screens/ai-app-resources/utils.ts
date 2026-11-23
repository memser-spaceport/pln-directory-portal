import { ADMIN_PERMISSIONS, AI_APPS_PERMISSIONS } from '../../utils/constants';
import { DEFAULT_AI_APP_RESOURCES } from './constants';
import { AiAppAudienceSettings, AiAppResourcesResponse, AiAppResourceValues } from './types';

/** Mirrors AiAppsResourcesAdminAuthGuard: full Directory admins or the dedicated permission. */
export function canManageAiAppResources(hasPermission: (permission: string) => boolean): boolean {
  return hasPermission(ADMIN_PERMISSIONS.DIRECTORY_FULL) || hasPermission(AI_APPS_PERMISSIONS.RESOURCES_MANAGE);
}

/** Mirrors the ai-app-audience admin endpoints: only full Directory admins can open an app to members. */
export function canManageAiAppAudience(hasPermission: (permission: string) => boolean): boolean {
  return hasPermission(ADMIN_PERMISSIONS.DIRECTORY_FULL);
}

export function resourcesToForm(response: AiAppResourcesResponse | undefined): {
  values: AiAppResourceValues;
  isOverride: boolean;
} {
  const override = response?.override;
  if (override) {
    return {
      values: {
        cpuRequest: override.cpuRequest ?? '',
        cpuLimit: override.cpuLimit ?? '',
        memoryRequest: override.memoryRequest ?? '',
        memoryLimit: override.memoryLimit ?? '',
      },
      isOverride: true,
    };
  }
  return { values: { ...DEFAULT_AI_APP_RESOURCES }, isOverride: false };
}

export function trimResourceValues(values: AiAppResourceValues): AiAppResourceValues {
  return {
    cpuRequest: values.cpuRequest.trim(),
    cpuLimit: values.cpuLimit.trim(),
    memoryRequest: values.memoryRequest.trim(),
    memoryLimit: values.memoryLimit.trim(),
  };
}

export function isSameResourceValues(a: AiAppResourceValues, b: AiAppResourceValues): boolean {
  const left = trimResourceValues(a);
  const right = trimResourceValues(b);
  return (
    left.cpuRequest === right.cpuRequest &&
    left.cpuLimit === right.cpuLimit &&
    left.memoryRequest === right.memoryRequest &&
    left.memoryLimit === right.memoryLimit
  );
}

export function hasEmptyResourceValue(values: AiAppResourceValues): boolean {
  return Object.values(values).some((value) => value.trim() === '');
}

/**
 * Extracts a user-safe message from an API error. The backend returns either
 * `{ message: string }`, `{ message: string[] }` or a zod validation body with `errors`.
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data as
    | { message?: unknown; errors?: unknown }
    | undefined;

  if (data) {
    if (typeof data.message === 'string' && data.message.trim()) return data.message;
    if (Array.isArray(data.message) && data.message.length > 0) return data.message.join('; ');
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      const messages = data.errors
        .map((e) => (typeof e === 'string' ? e : (e as { message?: unknown })?.message))
        .filter((m): m is string => typeof m === 'string' && m.trim() !== '');
      if (messages.length > 0) return messages.join('; ');
    }
  }

  return fallback;
}

export function getHostUrl(host: string | null | undefined): string | null {
  if (!host) return null;
  return /^https?:\/\//i.test(host) ? host : `https://${host}`;
}

export function getApiErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

export function isNotFoundError(error: unknown): boolean {
  return getApiErrorStatus(error) === 404;
}

export function isSamePolicyCodes(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
}

type AudienceLists = Pick<AiAppAudienceSettings, 'policyCodes'> &
  Partial<Pick<AiAppAudienceSettings, 'permissionCodes' | 'members'>>;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "1 policy, 2 permissions and 3 members" for the non-empty audience lists. */
function describeAudience(audience: AudienceLists): string {
  const parts = [
    audience.policyCodes.length ? plural(audience.policyCodes.length, 'policy', 'policies') : null,
    audience.permissionCodes?.length ? plural(audience.permissionCodes.length, 'permission', 'permissions') : null,
    audience.members?.length ? plural(audience.members.length, 'member', 'members') : null,
  ].filter((part): part is string => part !== null);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function isAudienceEmpty(audience: AudienceLists): boolean {
  return !audience.policyCodes.length && !audience.permissionCodes?.length && !audience.members?.length;
}

export function getAudienceStatusLabel(audience: AudienceLists): string {
  if (isAudienceEmpty(audience)) return 'PL Infra only';
  return `Open to ${describeAudience(audience)}`;
}

/** States plainly what saving this audience does; shown in the confirmation step. */
export function getAudienceConfirmMessage(audience: AudienceLists, appName: string): string {
  if (isAudienceEmpty(audience)) return `Nobody outside PL Infra will be able to open ${appName}.`;
  const onlyPolicies = !audience.permissionCodes?.length && !audience.members?.length;
  if (onlyPolicies && audience.policyCodes.length === 1) {
    return `Members holding this policy will be able to open ${appName}.`;
  }
  if (onlyPolicies) {
    return `Members holding any of these ${audience.policyCodes.length} policies will be able to open ${appName}.`;
  }
  return `Approved members matching any of ${describeAudience(audience)} will be able to open ${appName}.`;
}

/** Same rule as the API: 2–60 lowercase letters, digits or single hyphens, no hyphen at either end. */
export function getAppPathError(path: string): string | null {
  const value = path.trim();
  if (!value) return null;
  if (!/^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])$/.test(value) || value.includes('--')) {
    return 'Use 2–60 lowercase letters, digits or single hyphens, not starting or ending with a hyphen.';
  }
  if (/^c[a-z0-9]{24}$/.test(value)) return 'This looks like an app ID. Pick a readable path.';
  return null;
}

/** Whether the edited settings differ from the saved ones. */
export function isSameAudienceSettings(a: AiAppAudienceSettings, b: AiAppAudienceSettings): boolean {
  return (
    isSamePolicyCodes(a.policyCodes, b.policyCodes) &&
    isSamePolicyCodes(a.permissionCodes, b.permissionCodes) &&
    isSamePolicyCodes(
      a.members.map((m) => m.uid),
      b.members.map((m) => m.uid)
    ) &&
    a.showInMore === b.showInMore &&
    (a.path ?? '') === (b.path ?? '') &&
    (a.iconUrl ?? '') === (b.iconUrl ?? '') &&
    a.hideTopNav === b.hideTopNav
  );
}
