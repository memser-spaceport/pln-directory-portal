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

export interface FeedbackLinearCredentials {
  clientId: string;
  clientSecret: string;
  imageHosts: string[];
  maxAttempts: number;
}

/**
 * The Linear app credentials plus the shared push settings, or null when they
 * are not set. Enough for the worker and AI App feedback, which pick their own
 * teams; platform feedback also needs `getFeedbackLinearConfig`.
 */
export function getFeedbackLinearCredentials(): FeedbackLinearCredentials | null {
  const clientId = env('FEEDBACK_LINEAR_CLIENT_ID');
  const clientSecret = env('FEEDBACK_LINEAR_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret, imageHosts: feedbackLinearImageHosts(), maxAttempts: feedbackLinearMaxAttempts() };
}

export interface FeedbackLinearMemberAppsTarget {
  teamId: string;
  projectId: string | null;
}

/**
 * The one Linear team (and optional project) every member AI App's private
 * feedback goes to, or null when it is not set (those pushes are then off).
 */
export function getFeedbackLinearMemberAppsTarget(): FeedbackLinearMemberAppsTarget | null {
  const teamId = env('FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID');
  if (!teamId) {
    return null;
  }
  return { teamId, projectId: env('FEEDBACK_LINEAR_MEMBER_APPS_PROJECT_ID') };
}

/** The platform-feedback config, or null when it is not configured (platform pushes are then off). */
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
