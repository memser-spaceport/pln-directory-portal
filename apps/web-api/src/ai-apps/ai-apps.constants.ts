/**
 * AI Apps (PL Infra) — POC constants.
 *
 * The starter kit no longer ships a long-lived token. Instead the member's AI
 * agent starts a short-lived "connect" session, the member approves it in LabOS
 * (proving `ai_apps.write`), and we mint a short-lived deploy token bound to that
 * session. The agent uploads the app ZIP to us with that token; our backend
 * stores it in S3 and proxies the deploy to the sandbox runner using the
 * server-side runner token — so neither AWS credentials nor the runner secret
 * ever leave our infrastructure.
 */

/** Header the AI agent sends with its short-lived deploy token. */
export const AI_APP_TOKEN_HEADER = 'x-app-token';

/** Prefix for minted short-lived deploy tokens (for easy identification). */
export const AI_APP_DEPLOY_TOKEN_PREFIX = 'plndeploy_';

/**
 * How long a PENDING connect session stays open for the member to log in and
 * approve it before it expires (10 minutes).
 */
export const AI_APPS_CONNECT_SESSION_TTL_MS = 10 * 60 * 1000;

/**
 * Lifetime of the deploy token minted on approval (60 minutes). The agent may
 * deploy repeatedly within this window; after it the member must reconnect.
 */
export const AI_APPS_DEPLOY_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Suggested poll interval (seconds) the agent waits between connect polls. */
export const AI_APPS_CONNECT_POLL_INTERVAL_SEC = 3;

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

/**
 * Public URL of THIS API's connect-session endpoint, written into the starter
 * kit so the agent knows where to start a connect session.
 */
export const AI_APPS_CONNECT_ENDPOINT =
  process.env.AI_APPS_CONNECT_ENDPOINT || 'https://api.plnetwork.io/v1/ai-apps/connect';

/**
 * Base URL of the LabOS portal that hosts the connect page the member opens to
 * approve a session. Combined with the session uid to build the connect link.
 */
export const AI_APPS_PORTAL_URL = process.env.AI_APPS_PORTAL_URL || 'https://directory.plnetwork.io';

/** The LabOS connect page URL a member opens to approve an agent's session. */
export const buildConnectUrl = (sessionUid: string): string =>
  `${AI_APPS_PORTAL_URL}/pl-infra/ai-apps/connect?session=${encodeURIComponent(sessionUid)}`;
