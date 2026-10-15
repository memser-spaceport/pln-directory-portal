/**
 * Env-driven settings for pushing feedback to Linear (docs/FEEDBACK_LINEAR.md).
 * Read on every call so tests and config reloads see the current environment.
 */

export const FEEDBACK_LINEAR_DEFAULT_SYNC_CRON = '*/15 * * * * *';
export const FEEDBACK_LINEAR_DEFAULT_MAX_ATTEMPTS = 8;

export interface FeedbackLinearConfig {
  clientId: string;
  clientSecret: string;
  platformTeamId: string;
  platformStateId: string;
  aiAppsProjectId: string | null;
  labelId: string | null;
  imageHosts: string[];
  maxAttempts: number;
}

function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Hosts the server may download feedback images from. Defaults to the hosts
 * `/v1/images` returns: the image bucket's S3 location, plus the configured
 * S3 domain and IPFS worker when set.
 */
export function feedbackLinearImageHosts(): string[] {
  const explicit = env('FEEDBACK_LINEAR_IMAGE_HOSTS');
  if (explicit) {
    return explicit
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  }
  const bucket = env('AWS_S3_IMAGE_BUCKET_NAME');
  const region = env('AWS_REGION');
  const hosts = [
    bucket && region ? `${bucket}.s3.${region}.amazonaws.com`.toLowerCase() : null,
    hostOf(env('AWS_S3_DOMAIN')),
    hostOf(env('WORKER_IMAGE_URL')),
  ].filter((host): host is string => Boolean(host));
  return [...new Set(hosts)];
}

export function feedbackLinearMaxAttempts(): number {
  const parsed = Number.parseInt(env('FEEDBACK_LINEAR_MAX_ATTEMPTS') ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FEEDBACK_LINEAR_DEFAULT_MAX_ATTEMPTS;
}

/** The full config, or null when Linear is not configured (the feature is then off). */
export function getFeedbackLinearConfig(): FeedbackLinearConfig | null {
  const clientId = env('FEEDBACK_LINEAR_CLIENT_ID');
  const clientSecret = env('FEEDBACK_LINEAR_CLIENT_SECRET');
  const platformTeamId = env('FEEDBACK_LINEAR_PLATFORM_TEAM_ID');
  const platformStateId = env('FEEDBACK_LINEAR_PLATFORM_STATE_ID');
  if (!clientId || !clientSecret || !platformTeamId || !platformStateId) {
    return null;
  }
  return {
    clientId,
    clientSecret,
    platformTeamId,
    platformStateId,
    aiAppsProjectId: env('FEEDBACK_LINEAR_AI_APPS_PROJECT_ID'),
    labelId: env('FEEDBACK_LINEAR_LABEL_ID'),
    imageHosts: feedbackLinearImageHosts(),
    maxAttempts: feedbackLinearMaxAttempts(),
  };
}

export function isFeedbackLinearConfigured(): boolean {
  return getFeedbackLinearConfig() !== null;
}
