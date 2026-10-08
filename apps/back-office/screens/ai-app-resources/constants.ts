import { AiAppResourceValues } from './types';

/**
 * Standard Deployment Orchestrator container resources. The API returns
 * `override: null` when an app uses these; it does not return the values.
 */
export const DEFAULT_AI_APP_RESOURCES: AiAppResourceValues = {
  cpuRequest: '30m',
  cpuLimit: '300m',
  memoryRequest: '64Mi',
  memoryLimit: '384Mi',
};

export const AI_APP_RESOURCE_FIELDS: { key: keyof AiAppResourceValues; label: string; placeholder: string }[] = [
  { key: 'cpuRequest', label: 'CPU Request', placeholder: 'e.g. 500m' },
  { key: 'cpuLimit', label: 'CPU Limit', placeholder: 'e.g. 1' },
  { key: 'memoryRequest', label: 'Memory Request', placeholder: 'e.g. 512Mi' },
  { key: 'memoryLimit', label: 'Memory Limit', placeholder: 'e.g. 1Gi' },
];
