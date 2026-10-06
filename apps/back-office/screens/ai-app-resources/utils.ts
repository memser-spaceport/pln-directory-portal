import { ADMIN_PERMISSIONS, AI_APPS_PERMISSIONS } from '../../utils/constants';
import { DEFAULT_AI_APP_RESOURCES } from './constants';
import { AiAppResourcesResponse, AiAppResourceValues } from './types';

/** Mirrors AiAppsResourcesAdminAuthGuard: full Directory admins or the dedicated permission. */
export function canManageAiAppResources(hasPermission: (permission: string) => boolean): boolean {
  return hasPermission(ADMIN_PERMISSIONS.DIRECTORY_FULL) || hasPermission(AI_APPS_PERMISSIONS.RESOURCES_MANAGE);
}

export function resourcesToForm(response: AiAppResourcesResponse | undefined): {
  values: AiAppResourceValues;
  isOverride: boolean;
} {
  if (response?.override) {
    return { values: { ...response.override }, isOverride: true };
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
