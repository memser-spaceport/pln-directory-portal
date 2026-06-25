/**
 * AI Apps (PL Infra) — POC constants.
 *
 * The deploy token bundled in the starter kit authenticates the member's AI
 * agent against our `/v1/ai-apps/deploy` endpoint. The agent uploads the app
 * ZIP to us; our backend stores it in S3 and proxies the deploy to the sandbox
 * runner using the server-side runner token — so neither AWS credentials nor
 * the runner secret ever leave our infrastructure.
 */

/** Header the AI agent sends with its personal deploy token. */
export const AI_APP_TOKEN_HEADER = 'x-app-token';

/** Prefix for generated personal deploy tokens (for easy identification). */
export const AI_APP_TOKEN_PREFIX = 'plnapp_';

/** Max app ZIP size accepted by the deploy endpoint (50 MB). */
export const AI_APPS_MAX_ZIP_BYTES = 50 * 1024 * 1024;

/** Sandbox runner base URL (override via env for other environments). */
export const AI_APPS_RUNNER_URL = process.env.AI_APPS_RUNNER_URL || 'https://sandbox-runner.plnetwork.io';

/** Server-side token used to call the sandbox runner `/deploy` endpoint. */
export const AI_APPS_RUNNER_TOKEN = process.env.AI_APPS_RUNNER_TOKEN || '';

/** S3 bucket the sandbox runner reads app bundles from. */
export const AI_APPS_S3_BUCKET = process.env.AI_APPS_S3_BUCKET || '';

/** Build the S3 key for an app bundle: apps/<appId>/<deploymentId>/app.zip */
export const buildAppS3Key = (appId: string, deploymentId: string): string => `apps/${appId}/${deploymentId}/app.zip`;

/**
 * The sandbox host/URL for an app is deterministic from its appId, so we can
 * compute it up front (before the runner responds): sandbox-<appId>.plnetwork.io
 */
export const buildAppHost = (appId: string): string => `sandbox-${appId}.plnetwork.io`;
export const buildAppUrl = (appId: string): string => `https://${buildAppHost(appId)}`;
export const buildAppHttpUrl = (appId: string): string => `http://${buildAppHost(appId)}`;

/**
 * Public URL of THIS API's deploy endpoint, written into the starter kit so the
 * agent knows where to POST. Defaults to the conventional prod path.
 */
export const AI_APPS_DEPLOY_ENDPOINT =
  process.env.AI_APPS_DEPLOY_ENDPOINT || 'https://api.plnetwork.io/v1/ai-apps/deploy';
