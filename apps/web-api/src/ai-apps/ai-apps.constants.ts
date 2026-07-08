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

/** Project scope for the runner's secrets/deployments API (`/v1/projects/<project>/…`). */
export const AI_APPS_RUNNER_PROJECT = process.env.AI_APPS_RUNNER_PROJECT || 'default';

/** Environment label the runner stores secrets under (e.g. `dev` on Dev, `prod` on Prod). */
export const AI_APPS_RUNNER_ENVIRONMENT = process.env.AI_APPS_RUNNER_ENVIRONMENT || 'prod';

/** Runner endpoint that saves (merge/upsert) an app's runtime secrets. */
export const buildRunnerSecretsUrl = (): string =>
  `${AI_APPS_RUNNER_URL}/v1/projects/${AI_APPS_RUNNER_PROJECT}/secrets`;

/** Build the S3 key for an app bundle: apps/<appId>/<deploymentId>/app.zip */
export const buildAppS3Key = (appId: string, deploymentId: string): string => `apps/${appId}/${deploymentId}/app.zip`;

/**
 * Base domain apps are served under, per environment:
 * dev → dev.plnetwork.io, prod → prod.plnetwork.io.
 */
export const AI_APPS_APP_DOMAIN = process.env.AI_APPS_APP_DOMAIN || 'prod.plnetwork.io';

/**
 * The sandbox host/URL for an app is deterministic from its appId, so we can
 * compute it up front (before the runner responds): <appId>.<AI_APPS_APP_DOMAIN>
 */
export const buildAppHost = (appId: string): string => `${appId}.${AI_APPS_APP_DOMAIN}`;
export const buildAppUrl = (appId: string): string => `https://${buildAppHost(appId)}`;
export const buildAppHttpUrl = (appId: string): string => `http://${buildAppHost(appId)}`;

/**
 * Public base URL of THIS API. The agent-facing endpoint URLs written into the
 * starter kit are all derived from it (`<base>/v1/ai-apps/…`), so adding a new
 * endpoint needs no new env var. The per-endpoint vars below remain as optional
 * overrides for environments that already set them.
 */
export const AI_APPS_BASE_URL = process.env.AI_APPS_BASE_URL;

/** Public URL of THIS API's deploy endpoint, written into the starter kit so the agent knows where to POST. */
export const AI_APPS_DEPLOY_ENDPOINT = process.env.AI_APPS_DEPLOY_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/deploy`;

/** Public URL of THIS API's connect-session endpoint, written into the starter kit. */
export const AI_APPS_CONNECT_ENDPOINT =
  process.env.AI_APPS_CONNECT_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/connect`;

/**
 * Public URL of THIS API's draft-registration endpoint (apps that need runtime
 * secrets), written into the starter kit.
 */
export const AI_APPS_DRAFT_ENDPOINT = process.env.AI_APPS_DRAFT_ENDPOINT || `${AI_APPS_BASE_URL}/v1/ai-apps/draft`;

/**
 * Base URL of the LabOS portal that hosts the connect page the member opens to
 * approve a session. Combined with the session uid to build the connect link.
 */
export const AI_APPS_PORTAL_URL = process.env.AI_APPS_PORTAL_URL;

/** The LabOS connect page URL a member opens to approve an agent's session. */
export const buildConnectUrl = (sessionUid: string): string =>
  `${AI_APPS_PORTAL_URL}/pl-infra/ai-apps/connect?session=${encodeURIComponent(sessionUid)}`;

/**
 * The LabOS app detail page for one AI App — for a draft this is where the
 * member enters secret values and clicks Deploy. The agent hands this link to
 * the member after registering a draft.
 */
export const buildAppPageUrl = (appUid: string): string =>
  `${AI_APPS_PORTAL_URL}/pl-infra/ai-apps/${encodeURIComponent(appUid)}`;
